import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { Client } from 'pg';

export type IntegrationRuntime = {
  baseUrl: string;
  databaseUrl: string;
  migrationUrl: string;
  readAIRequests(): Promise<Array<{ actorId: string; model: string; system: string; prompt: string }>>;
  startWorker(): Promise<void>;
  stopWorker(): Promise<void>;
  crashWorker(): Promise<void>;
  stop(): Promise<void>;
};

const identifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
const pause = (ms: number) => new Promise(resolveDelay => setTimeout(resolveDelay, ms));
const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
config({ path: resolve(backendRoot, '.env'), quiet: true });

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Porta de teste indisponível.');
  await new Promise<void>((accept, reject) => server.close(error => error ? reject(error) : accept()));
  return address.port;
}

function child(args: string[], env: NodeJS.ProcessEnv): ChildProcess {
  // Raw child output can contain connection details. Keep it off test reporters.
  return spawn(process.execPath, args, { cwd: backendRoot, env, stdio: 'ignore' });
}

async function waitExit(processChild: ChildProcess): Promise<void> {
  const code = await new Promise<number | null>((accept, reject) => {
    processChild.once('error', reject);
    processChild.once('exit', accept);
  });
  if (code !== 0) throw new Error(`Processo de preparação falhou (${code}); confira configuração local.`);
}

async function stopChild(processChild: ChildProcess): Promise<void> {
  if (processChild.exitCode !== null || processChild.signalCode !== null) return;
  processChild.kill('SIGTERM');
  const exited = new Promise<void>(accept => processChild.once('exit', () => accept()));
  await Promise.race([exited, pause(5000)]);
  if (processChild.exitCode === null && processChild.signalCode === null) {
    processChild.kill('SIGKILL');
    await exited;
  }
}

export async function startRuntime(withWorker = false, options: { port?: number; origin?: string; fakeAiDelayMs?: number } = {}): Promise<IntegrationRuntime> {
  const adminSource = process.env.INTEGRATION_ADMIN_URL ?? process.env.DATABASE_MIGRATION_URL;
  if (!adminSource) throw new Error('Configure INTEGRATION_ADMIN_URL para um PostgreSQL local de testes.');
  const adminUrl = new URL(adminSource);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(adminUrl.hostname) && process.env.ALLOW_REMOTE_TEST_DATABASE !== 'true') {
    throw new Error('Integração exige banco local; remoto depende de ALLOW_REMOTE_TEST_DATABASE explícito.');
  }
  const suffix = randomBytes(7).toString('hex');
  const database = `facilita_test_${suffix}`;
  const role = `facilita_test_runtime_${suffix}`;
  const migrationUrl = new URL(adminUrl);
  migrationUrl.pathname = `/${database}`;
  const runtimeUrl = new URL(migrationUrl);
  runtimeUrl.username = role;
  runtimeUrl.password = randomBytes(24).toString('hex');
  const admin = new Client({ connectionString: adminSource });
  const children: ChildProcess[] = [];
  const directory = await mkdtemp(resolve(tmpdir(), 'facilita-test-'));
  const aiCapturePath = resolve(directory, 'ai-requests.jsonl');
  let workerChild: ChildProcess | undefined;
  let databaseCreated = false;
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await Promise.all(children.map(stopChild));
    if (databaseCreated) {
      // Identifiers are generated here; never drop a name supplied by the caller.
      await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [database]);
      await admin.query(`DROP DATABASE ${identifier(database)}`);
      await admin.query(`DROP ROLE IF EXISTS ${identifier(role)}`);
    }
    await admin.end();
    await rm(directory, { recursive: true, force: true });
  };
  try {
    await admin.connect();
    await admin.query(`CREATE DATABASE ${identifier(database)}`);
    databaseCreated = true;
    const port = options.port ?? await freePort();
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: 'test', API_PORT: String(port), APP_ORIGIN: options.origin ?? 'http://localhost:3000',
      DATABASE_MIGRATION_URL: migrationUrl.toString(), DATABASE_URL: runtimeUrl.toString(),
      STORAGE_PATH: resolve(directory, 'storage'), PRIVATE_STORAGE_ROOT: resolve(directory, 'storage'),
      QUEUE_PREFIX: `facilita-test-${suffix}`, AI_PROVIDER: 'fake', EMBEDDING_PROVIDER: 'fake',
      AI_TEST_CAPTURE_PATH: aiCapturePath,
      AI_TEST_PROVIDER_DELAY_MS: String(Number.isSafeInteger(options.fakeAiDelayMs) ? Math.min(Math.max(options.fakeAiDelayMs ?? 0, 0), 10_000) : 0),
      VAULT_ACTIVE_KEY_ID: 'test-v1', VAULT_KEYS_JSON: JSON.stringify({ 'test-v1': randomBytes(32).toString('base64') }),
      PLATFORM_AI_ENABLED: 'false', SMTP_HOST: '127.0.0.1', SMTP_PORT: '1025',
    };
    const startWorker = async () => {
      if (workerChild && workerChild.exitCode === null && workerChild.signalCode === null) return;
      const spawned = child(['-r', 'ts-node/register', 'src/worker.ts'], env);
      workerChild = spawned;
      children.push(spawned);
      await pause(150);
      if (spawned.exitCode !== null || spawned.signalCode !== null) throw new Error('Worker de teste encerrou durante inicialização.');
    };
    const stopWorker = async () => {
      if (!workerChild) return;
      const current = workerChild;
      await stopChild(current);
      workerChild = undefined;
    };
    const crashWorker = async () => {
      if (!workerChild) return;
      const current = workerChild;
      if (current.exitCode === null && current.signalCode === null) {
        await new Promise<void>(accept => {
          current.once('exit', () => accept());
          current.kill('SIGKILL');
        });
      }
      workerChild = undefined;
    };
    await waitExit(child(['scripts/migrate.mjs'], env));
    const api = child(['-r', 'ts-node/register', 'src/main.ts'], env);
    children.push(api);
    if (withWorker) await startWorker();
    const baseUrl = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      if (api.exitCode !== null || api.signalCode !== null) throw new Error('API de teste encerrou durante inicialização.');
      ready = await fetch(`${baseUrl}/health/ready`, { signal: AbortSignal.timeout(1000) }).then(response => response.ok).catch(() => false);
      if (ready) break;
      await pause(200);
    }
    if (!ready) throw new Error('API de teste não ficou pronta no prazo.');
    return {
      baseUrl,
      databaseUrl: runtimeUrl.toString(),
      migrationUrl: migrationUrl.toString(),
      startWorker,
      stopWorker,
      crashWorker,
      readAIRequests: async () => {
        try {
          const contents = await readFile(aiCapturePath, 'utf8');
          return contents.split('\n').filter(Boolean).map(line => JSON.parse(line) as {
            actorId: string; model: string; system: string; prompt: string;
          });
        } catch (error) {
          if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return [];
          throw error;
        }
      },
      stop,
    };
  } catch (error) {
    await stop();
    throw error;
  }
}
