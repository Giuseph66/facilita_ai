import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startSupervisor } from './dev-supervisor.mjs';

const directory = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const requested = process.argv[2];
if (requested && !['main', 'worker'].includes(requested)) throw new Error('Use dev.mjs [main|worker].');
const entries = ['main', 'worker']
  .filter(entry => !requested || entry === requested)
  .map(entry => ({
    name: entry === 'main' ? 'API' : 'worker',
    command: process.execPath,
    args: ['-r', 'ts-node/register', `src/${entry}.ts`],
    cwd: directory,
    env: process.env,
  }));

const supervisor = startSupervisor(entries, { watchPath: resolve(directory, 'src') });
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await supervisor.stop();
};
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => void stop());
