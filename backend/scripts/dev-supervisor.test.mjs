import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { test } from 'node:test';
import { startSupervisor } from './dev-supervisor.mjs';

async function waitFor(predicate, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await pause(25);
  }
  assert.fail('Timed out waiting for supervised process state.');
}

async function lines(path) {
  try { return (await readFile(path, 'utf8')).trim().split('\n').filter(Boolean); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

async function assertGone(pid) {
  await waitFor(() => {
    try { process.kill(Number(pid), 0); return false; }
    catch (error) { return error.code === 'ESRCH'; }
  });
}

test('supervisor backs off after a crash and stop leaves no restarted child', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'facilita-supervisor-'));
  const log = join(directory, 'runs');
  const script = join(directory, 'child.mjs');
  await writeFile(script, `
    import { appendFileSync, readFileSync } from 'node:fs';
    const log = ${JSON.stringify(log)};
    let run = 1;
    try { run = Number(readFileSync(log, 'utf8').trim().split('\\n').length) + 1; } catch {}
    appendFileSync(log, (Date.now() + ',' + process.pid + '\\n'));
    if (run === 1) setTimeout(() => process.exit(1), 20);
    else setInterval(() => {}, 1000);
  `);
  const supervisor = startSupervisor([{
    name: 'crash-fixture', command: process.execPath, args: [script], cwd: directory, stdio: 'ignore',
  }], { baseDelayMs: 80, maxDelayMs: 160, stableForMs: 5_000, stopTimeoutMs: 1_000 });
  try {
    await waitFor(async () => (await lines(log)).length >= 2);
    const runs = (await lines(log)).map(line => line.split(',').map(Number));
    assert.ok(runs[1][0] - runs[0][0] >= 70, 'restart should wait for the initial backoff');
    await supervisor.stop();
    await assertGone(runs[1][1]);
    await pause(120);
    assert.equal((await lines(log)).length, 2, 'stop must cancel pending restarts');
  } finally {
    await supervisor.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('supervisor retries a spawn error instead of leaving a service marked as running', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'facilita-spawn-error-'));
  const log = join(directory, 'runs');
  const script = join(directory, 'child.mjs');
  await writeFile(script, `
    import { appendFileSync } from 'node:fs';
    appendFileSync(${JSON.stringify(log)}, process.pid + '\\n');
    setInterval(() => {}, 1000);
  `);
  let commandReads = 0;
  const entry = {
    name: 'spawn-error-fixture',
    get command() { commandReads += 1; return commandReads === 1 ? join(directory, 'missing-executable') : process.execPath; },
    args: [script], cwd: directory, stdio: 'ignore',
  };
  const supervisor = startSupervisor([entry], { baseDelayMs: 60, maxDelayMs: 120, stableForMs: 5_000, stopTimeoutMs: 1_000 });
  try {
    await waitFor(async () => (await lines(log)).length >= 1);
    assert.ok(commandReads >= 2, 'a failed spawn should schedule another launch');
    const pids = (await lines(log)).map(Number);
    await supervisor.stop();
    await Promise.all(pids.map(assertGone));
  } finally {
    await supervisor.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('supervisor watches source changes and shutdown terminates the real service process', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'facilita-watch-'));
  const sourceDirectory = join(directory, 'src');
  const stateDirectory = join(directory, 'state');
  await Promise.all([mkdir(sourceDirectory), mkdir(stateDirectory)]);
  const log = join(stateDirectory, 'runs');
  const script = join(sourceDirectory, 'watched.mjs');
  const source = `import { appendFileSync } from 'node:fs';\nappendFileSync(${JSON.stringify(log)}, process.pid + '\\n');\nsetInterval(() => {}, 1000);\n`;
  await writeFile(script, source);
  const supervisor = startSupervisor([{
    name: 'watch-fixture', command: process.execPath, args: [script], cwd: directory, stdio: 'ignore',
  }], { watchPath: sourceDirectory, watchDebounceMs: 50, baseDelayMs: 50, maxDelayMs: 100, stableForMs: 5_000, stopTimeoutMs: 1_000 });
  try {
    await waitFor(async () => (await lines(log)).length >= 1);
    await pause(150);
    await writeFile(script, `${source}// changed\n`);
    await waitFor(async () => (await lines(log)).length >= 2);
    const pids = (await lines(log)).map(Number);
    await supervisor.stop();
    await Promise.all(pids.map(assertGone));
  } finally {
    await supervisor.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
