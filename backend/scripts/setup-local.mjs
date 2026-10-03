import { randomBytes } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const backendEnv = resolve(root, 'backend/.env');
const frontEnv = resolve(root, 'front-end/.env.local');
async function exists(path) { try { await access(path); return true; } catch { return false; } }
if (!(await exists(backendEnv))) {
  const migrationPassword = randomBytes(24).toString('hex');
  const runtimePassword = randomBytes(24).toString('hex');
  const vaultKey = randomBytes(32).toString('base64');
  let template = await readFile(resolve(root, 'backend/.env.example'), 'utf8');
  template = template.replace('POSTGRES_PASSWORD=replace-with-generated-local-password', `POSTGRES_PASSWORD=${migrationPassword}`);
  template = template.replace('DATABASE_URL=postgresql://facilita_runtime:replace-with-generated-local-password', `DATABASE_URL=postgresql://facilita_runtime:${runtimePassword}`);
  template = template.replace('DATABASE_MIGRATION_URL=postgresql://facilita_migrator:replace-with-generated-local-password', `DATABASE_MIGRATION_URL=postgresql://facilita_migrator:${migrationPassword}`);
  template = template.replace('RUNTIME_DB_PASSWORD=replace-with-generated-local-password', `RUNTIME_DB_PASSWORD=${runtimePassword}`);
  template = template.replace('replace-with-32-byte-base64-key', vaultKey);
  await writeFile(backendEnv, template, { mode: 0o600, flag: 'wx' });
  process.stdout.write('backend/.env criado com segredos locais aleatórios.\n');
} else process.stdout.write('backend/.env existente preservado.\n');
if (!(await exists(frontEnv))) {
  await writeFile(frontEnv, await readFile(resolve(root, 'front-end/.env.example'), 'utf8'), { mode: 0o600, flag: 'wx' });
  process.stdout.write('front-end/.env.local criado.\n');
}
await mkdir(resolve(root, 'backend/.storage'), { recursive: true, mode: 0o700 });
await mkdir(resolve(root, 'backend/.models'), { recursive: true, mode: 0o700 });
