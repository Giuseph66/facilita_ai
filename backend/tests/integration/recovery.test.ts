import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { expect, it } from 'vitest';
import { TestClient } from '../support/http';
import { startRuntime } from '../support/runtime.mts';

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((accept, reject) => {
    const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? accept() : reject(new Error(`${command}: exit ${code}`)));
  });
}

it('restaura banco e storage em destino isolado, preservando isolamento da role runtime', async () => {
  const runtime = await startRuntime();
  const directory = await mkdtemp(resolve(tmpdir(), 'facilita-recovery-'));
  const storage = resolve(directory, 'storage');
  const restoredStorage = resolve(directory, 'restored-storage');
  const backups = resolve(directory, 'backups');
  const database = `facilita_restore_${randomUUID().replaceAll('-', '')}`;
  const migratorUrl = new URL(runtime.migrationUrl);
  const admin = new Client({ connectionString: runtime.migrationUrl });
  let created = false;
  try {
    await admin.connect();
    const http = new TestClient(runtime.baseUrl);
    const account = await http.json<{ user: { id: string }; workspaces: { id: string }[] }>('/auth/register', 'POST', {
      name: 'Recuperação', email: `${randomUUID()}@example.test`, password: 'Backup-Isolado!42', persona: 'TEACHER',
    });
    expect(account.status).toBe(201);
    const course = await http.json<{ id: string }>(`/workspaces/${account.body.workspaces[0].id}/courses`, 'POST', {
      title: 'Curso recuperado', topics: ['Tópico de recuperação'], objectives: ['Validar persistência'],
    });
    expect(course.status).toBe(201);
    await mkdir(resolve(storage, 'documents'), { recursive: true, mode: 0o700 });
    await mkdir(restoredStorage, { mode: 0o700 });
    const fixture = Buffer.from('Arquivo privado para ensaio de restauração.');
    await writeFile(resolve(storage, 'documents', 'original.bin'), fixture, { mode: 0o600 });
    await run(process.execPath, ['scripts/backup.mjs', backups], {
      DATABASE_MIGRATION_URL: runtime.migrationUrl, STORAGE_PATH: storage,
    });
    const files = await readdir(backups);
    const dump = files.find(name => name.endsWith('.dump'));
    const archive = files.find(name => name.endsWith('.tar.gz'));
    expect(dump).toBeDefined();
    expect(archive).toBeDefined();
    await admin.query(`CREATE DATABASE "${database}"`);
    created = true;
    await run('pg_restore', ['--exit-on-error', '--host', migratorUrl.hostname, '--port', migratorUrl.port || '5432',
      '--username', decodeURIComponent(migratorUrl.username), '--dbname', database, resolve(backups, dump!)], {
      PGPASSWORD: decodeURIComponent(migratorUrl.password),
    });
    await run('tar', ['-xzf', resolve(backups, archive!), '-C', restoredStorage], {});
    expect(await readFile(resolve(restoredStorage, 'documents', 'original.bin'))).toEqual(fixture);
    const readerUrl = new URL(runtime.databaseUrl);
    readerUrl.pathname = `/${database}`;
    const reader = new Client({ connectionString: readerUrl.toString() });
    await reader.connect();
    try {
      expect((await reader.query('SELECT id FROM courses')).rows).toHaveLength(0);
      await reader.query('BEGIN');
      await reader.query("SELECT set_config('app.user_id',$1,true)", [account.body.user.id]);
      expect((await reader.query('SELECT id,title FROM courses WHERE id=$1', [course.body.id])).rows)
        .toEqual([{ id: course.body.id, title: 'Curso recuperado' }]);
      await reader.query('COMMIT');
      expect((await reader.query('SELECT id FROM courses')).rows).toHaveLength(0);
      const role = await reader.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user');
      expect(role.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
    } finally { await reader.end(); }
  } finally {
    if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    await admin.end();
    await runtime.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
