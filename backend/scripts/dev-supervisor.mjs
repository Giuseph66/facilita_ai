import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

export function startSupervisor(entries, options = {}) {
  const baseDelayMs = options.baseDelayMs ?? 250;
  const maxDelayMs = options.maxDelayMs ?? 5_000;
  const stableForMs = options.stableForMs ?? 10_000;
  const stopTimeoutMs = options.stopTimeoutMs ?? 5_000;
  const watchPath = options.watchPath;
  const states = entries.map(entry => ({ entry, child: undefined, timer: undefined, failures: 0 }));
  let stopping = false;
  let restarting = false;
  let restartAgain = false;
  let closeWatcher = () => {};

  const waitForExit = child => new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once('exit', resolve);
  });

  const stopChildren = async () => {
    const children = states.map(state => state.child).filter(Boolean);
    for (const child of children) child.kill('SIGTERM');
    if (!children.length) return;
    let timeout;
    await Promise.race([
      Promise.all(children.map(waitForExit)),
      new Promise(resolve => { timeout = setTimeout(resolve, stopTimeoutMs); }),
    ]);
    if (timeout) clearTimeout(timeout);
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
    await Promise.all(children.map(waitForExit));
  };

  const scheduleRestart = (state, startedAt, outcome) => {
    if (stopping || restarting) return;
    if (Date.now() - startedAt >= stableForMs) state.failures = 0;
    const delay = Math.min(baseDelayMs * (2 ** state.failures), maxDelayMs);
    state.failures += 1;
    process.stderr.write(`${state.entry.name} exited (${outcome}); restarting in ${delay}ms\n`);
    state.timer = setTimeout(() => {
      state.timer = undefined;
      launch(state);
    }, delay);
  };

  const restartChildren = async () => {
    if (stopping) return;
    if (restarting) { restartAgain = true; return; }
    restarting = true;
    do {
      restartAgain = false;
      for (const state of states) {
        if (state.timer) clearTimeout(state.timer);
        state.timer = undefined;
        state.failures = 0;
      }
      await stopChildren();
      if (!stopping) for (const state of states) launch(state);
    } while (restartAgain && !stopping);
    restarting = false;
  };

  const launch = state => {
    if (stopping) return;
    const { entry } = state;
    const startedAt = Date.now();
    let child;
    try {
      child = spawn(entry.command, entry.args ?? [], {
        cwd: entry.cwd,
        env: entry.env ?? process.env,
        stdio: entry.stdio ?? 'inherit',
      });
    } catch (error) {
      process.stderr.write(`${entry.name} process error: ${error.name}\n`);
      scheduleRestart(state, startedAt, 'spawn_error');
      return;
    }
    state.child = child;
    let spawned = false;
    let handled = false;
    const failed = outcome => {
      if (handled) return;
      handled = true;
      if (state.child === child) state.child = undefined;
      scheduleRestart(state, startedAt, outcome);
    };
    child.once('spawn', () => { spawned = true; });
    child.once('error', error => {
      process.stderr.write(`${entry.name} process error: ${error.name}\n`);
      if (!spawned) failed('spawn_error');
    });
    child.once('exit', (code, signal) => {
      failed(signal ?? code ?? 'unknown');
    });
  };

  function watchSource(root) {
    let closed = false;
    let recursiveWatcher;
    let fallbackWatchers = [];
    let notifyTimer;
    let rebuildTimer;

    const notify = () => {
      clearTimeout(notifyTimer);
      notifyTimer = setTimeout(() => { if (!closed) void restartChildren(); }, options.watchDebounceMs ?? 200);
    };

    const rebuildFallback = async () => {
      if (closed) return;
      for (const watcher of fallbackWatchers) watcher.close();
      fallbackWatchers = [];
      const directories = [];
      const visit = async directory => {
        directories.push(directory);
        const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
        await Promise.all(entries.filter(entry => entry.isDirectory()).map(entry => visit(join(directory, entry.name))));
      };
      await visit(root);
      if (closed) return;
      for (const directory of directories) {
        try {
          const watcher = watch(directory, () => {
            notify();
            clearTimeout(rebuildTimer);
            rebuildTimer = setTimeout(() => void rebuildFallback(), 100);
          });
          watcher.on('error', () => {
            clearTimeout(rebuildTimer);
            rebuildTimer = setTimeout(() => void rebuildFallback(), 100);
          });
          fallbackWatchers.push(watcher);
        } catch {
          // A directory may disappear while the fallback watcher is being rebuilt.
        }
      }
    };

    try {
      recursiveWatcher = watch(root, { recursive: true }, notify);
      recursiveWatcher.on('error', () => {
        recursiveWatcher?.close();
        recursiveWatcher = undefined;
        void rebuildFallback();
      });
    } catch {
      void rebuildFallback();
    }

    return () => {
      closed = true;
      clearTimeout(notifyTimer);
      clearTimeout(rebuildTimer);
      recursiveWatcher?.close();
      for (const watcher of fallbackWatchers) watcher.close();
    };
  }

  for (const state of states) launch(state);
  if (watchPath) closeWatcher = watchSource(watchPath);

  const stop = async () => {
    if (stopping) return;
    stopping = true;
    closeWatcher();
    for (const state of states) {
      if (state.timer) clearTimeout(state.timer);
      state.timer = undefined;
    }
    await stopChildren();
  };

  return { stop };
}
