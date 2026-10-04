import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repositoryRoot = resolve(process.cwd(), '..');
const backendRoot = resolve(repositoryRoot, 'backend');

async function loadRuntime() {
  const runtimeSource = resolve(backendRoot, 'tests/support/runtime.mts');
  const runtimeModule = resolve(backendRoot, '.local/test-support/runtime.mjs');
  const requireFromRepository = createRequire(resolve(repositoryRoot, 'package.json'));
  const ts = requireFromRepository('typescript') as typeof import('typescript');
  const source = await readFile(runtimeSource, 'utf8');
  const result = ts.transpileModule(source, {
    fileName: runtimeSource,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      esModuleInterop: true,
    },
    reportDiagnostics: true,
  });
  const errors = (result.diagnostics ?? []).filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error);
  if (errors.length > 0) {
    throw new Error(errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'));
  }

  await mkdir(dirname(runtimeModule), { recursive: true });
  await writeFile(runtimeModule, result.outputText, 'utf8');
  return import(pathToFileURL(runtimeModule).href);
}

async function enableJourneyAssessmentGeneration(migrationUrl: string) {
  const databaseUrl = new URL(migrationUrl);
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ""));
  if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(databaseUrl.hostname)
    || !/^facilita_test_[a-f0-9]{14}$/.test(databaseName)) {
    throw new Error('A permissão E2E exige uma base facilita_test_* local e descartável.');
  }

  const requireFromBackend = createRequire(resolve(backendRoot, 'package.json'));
  type SqlClient = { connect(): Promise<void>; query(sql: string): Promise<unknown>; end(): Promise<void> };
  const { Client } = requireFromBackend('pg') as {
    Client: new (options: { connectionString: string }) => SqlClient;
  };
  const client = new Client({ connectionString: migrationUrl });
  await client.connect();
  try {
    await client.query(`
      CREATE OR REPLACE FUNCTION qa_e2e_teacher_pro_plan() RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      DECLARE pro_plan_id uuid;
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM public.billing_accounts AS account
          JOIN public.users AS user_account ON user_account.id = account.owner_user_id
          WHERE account.id = NEW.account_id
            AND user_account.default_persona = 'TEACHER'
            AND user_account.email_normalized LIKE 'e2e-intelligence-%'
        ) THEN
          SELECT id INTO pro_plan_id
          FROM public.plans
          WHERE code = 'TEACHER_PRO' AND status = 'ACTIVE'
          ORDER BY catalog_version DESC
          LIMIT 1;

          IF pro_plan_id IS NULL THEN
            RAISE EXCEPTION 'TEACHER_PRO não está disponível no catálogo de testes.';
          END IF;

          NEW.plan_id := pro_plan_id;
        END IF;
        RETURN NEW;
      END;
      $$;

      CREATE TRIGGER qa_e2e_teacher_pro_plan_before_insert
      BEFORE INSERT ON public.subscriptions
      FOR EACH ROW EXECUTE FUNCTION qa_e2e_teacher_pro_plan();
    `);
  } finally {
    await client.end();
  }
}

export default async function globalSetup() {
  const { startRuntime } = await loadRuntime();
  const runtime = await startRuntime(true, { port: 3101, origin: 'http://127.0.0.1:3100' });
  try {
    await enableJourneyAssessmentGeneration(runtime.migrationUrl);
  } catch (error) {
    await runtime.stop();
    throw error;
  }
  return async () => { await runtime.stop(); };
}
