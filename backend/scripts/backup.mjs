import 'dotenv/config';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve(process.argv[2] ?? '.local/backups');
await mkdir(output, { recursive: true, mode: 0o700 });
const stamp = new Date().toISOString().replaceAll(':', '-');
const databaseFile = resolve(output, `database-${stamp}.dump`);
const storageFile = resolve(output, `storage-${stamp}.tar.gz`);
const url = new URL(process.env.DATABASE_MIGRATION_URL ?? '');
function run(command, args, env) {
  return new Promise((accept, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, ...env } });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? accept() : reject(new Error(`${command} falhou (${code}).`)));
  });
}
await run('pg_dump', ['--format=custom', '--file', databaseFile, '--host', url.hostname, '--port', url.port || '5432', '--username', decodeURIComponent(url.username), decodeURIComponent(url.pathname.slice(1))], { PGPASSWORD: decodeURIComponent(url.password) });
await run('tar', ['-czf', storageFile, '-C', resolve(process.env.STORAGE_PATH ?? '.storage'), '.']);
process.stdout.write(`Backup criado: ${databaseFile}\nStorage: ${storageFile}\nProteja e teste restauração em ambiente separado.\n`);
