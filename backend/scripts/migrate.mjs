import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const migrationUrl = process.env.DATABASE_MIGRATION_URL;
const runtimeUrl = process.env.DATABASE_URL;
if (!migrationUrl || !runtimeUrl) throw new Error('DATABASE_MIGRATION_URL e DATABASE_URL são obrigatórias.');
const migration = new URL(migrationUrl);
const runtime = new URL(runtimeUrl);
if (migration.pathname !== runtime.pathname) throw new Error('URLs de migration/runtime devem usar o mesmo banco.');
if (migration.hostname !== runtime.hostname || (migration.port || '5432') !== (runtime.port || '5432')) {
  throw new Error('URLs de migration/runtime devem usar o mesmo servidor PostgreSQL.');
}
const role = decodeURIComponent(runtime.username);
if (!/^[a-z][a-z0-9_]{2,62}$/.test(role)) throw new Error('Nome de role runtime inválido.');
if (role === decodeURIComponent(migration.username)) throw new Error('Runtime e migrator precisam de roles distintas.');
const password = decodeURIComponent(runtime.password);
const quote = value => `'${value.replaceAll("'", "''")}'`;
const identifier = value => `"${value.replaceAll('"', '""')}"`;
const client = new Client({ connectionString: migrationUrl, application_name: 'facilita-migrations' });
const directory = resolve(dirname(fileURLToPath(import.meta.url)), '../migrations');
try {
  await client.connect();
  const migratorRole = await client.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user');
  if (!migratorRole.rows[0]?.rolsuper && !migratorRole.rows[0]?.rolbypassrls) {
    throw new Error('Migrator precisa ser SUPERUSER ou BYPASSRLS para funções autorizadas de invalidação; nunca usar essa credencial no runtime.');
  }
  await client.query("SELECT pg_advisory_lock(hashtext('facilita:migrations'))");
  const roles = await client.query('SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = $1', [role]);
  if (!roles.rows.length) await client.query(`CREATE ROLE ${identifier(role)} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD ${quote(password)}`);
  else if (roles.rows[0].rolsuper || roles.rows[0].rolbypassrls || roles.rows[0].rolcreatedb || roles.rows[0].rolcreaterole) {
    throw new Error('Role runtime não pode ter SUPERUSER, BYPASSRLS, CREATEDB ou CREATEROLE.');
  }
  await client.query('CREATE EXTENSION IF NOT EXISTS vector');
  await client.query('CREATE TABLE IF NOT EXISTS public.schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  const files = (await readdir(directory)).filter(name => /^\d+_[a-z0-9_]+\.sql$/.test(name)).sort();
  for (const name of files) {
    const source = await readFile(resolve(directory, name), 'utf8');
    const checksum = createHash('sha256').update(source).digest('hex');
    const applied = await client.query('SELECT checksum FROM schema_migrations WHERE name = $1', [name]);
    if (applied.rows.length) {
      if (applied.rows[0].checksum !== checksum) throw new Error(`Migration já aplicada foi modificada: ${name}. Criar nova migration.`);
      process.stdout.write(`Preservada: ${name}\n`);
      continue;
    }
    await client.query('BEGIN');
    try {
      await client.query(source);
      await client.query('INSERT INTO schema_migrations(name, checksum) VALUES($1, $2)', [name, checksum]);
      await client.query('COMMIT');
      process.stdout.write(`Aplicada: ${name}\n`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  const database = decodeURIComponent(migration.pathname.slice(1));
  await client.query(`GRANT CONNECT ON DATABASE ${identifier(database)} TO ${identifier(role)}`);
  await client.query(`GRANT USAGE ON SCHEMA public TO ${identifier(role)}`);
  await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${identifier(role)}`);
  // Submission is an atomic authorized transition; ordinary runtime SQL cannot forge results.
  await client.query(`REVOKE UPDATE ON public.practice_attempts FROM ${identifier(role)}`);
  await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${identifier(role)}`);
  for (const signature of [
    'public.app_is_class_teacher(uuid)',
    'public.app_can_create_class(uuid,uuid)',
    'public.app_is_material_owner(uuid)',
    'public.bump_workspace_acl(uuid)',
    'public.redeem_class_invitation(text)',
    'public.expired_export_actors()',
    'public.submit_practice_attempt(uuid,jsonb)',
    'public.invalidate_document_intelligence(uuid)',
    'public.health_queue_metrics()',
  ]) {
    await client.query(`GRANT EXECUTE ON FUNCTION ${signature} TO ${identifier(role)}`);
  }
  await client.query(`REVOKE ALL ON schema_migrations FROM ${identifier(role)}`);
  await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${identifier(role)}`);
  process.stdout.write('Migrations concluídas; runtime sem bypass de RLS.\n');
} finally {
  await client.end();
}
