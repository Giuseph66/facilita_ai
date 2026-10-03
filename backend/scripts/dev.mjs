import { spawn } from 'node:child_process';

const processes = ['main', 'worker'].map(entry => spawn(process.execPath,
  ['--watch', '-r', 'ts-node/register', `src/${entry}.ts`],
  { stdio: 'inherit', env: process.env }
));
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  for (const child of processes) child.kill('SIGTERM');
};
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);
for (const child of processes) child.on('exit', code => {
  if (!stopping) {
    process.exitCode = code ?? 1;
    stop();
  }
});
