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

export default async function globalSetup() {
  const { startRuntime } = await loadRuntime();
  const runtime = await startRuntime(true, { port: 3101, origin: 'http://127.0.0.1:3100' });
  return async () => { await runtime.stop(); };
}
