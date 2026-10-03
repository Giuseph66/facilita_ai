import 'dotenv/config';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const modelId = process.env.EMBEDDING_MODEL_ID || 'Xenova/multilingual-e5-small';
if (modelId !== 'Xenova/multilingual-e5-small') throw new Error('Instalador suporta somente o E5 aprovado; outro modelo exige validar tokenizer, dimensão e licença.');
const requestedRevision = process.argv[2] || process.env.EMBEDDING_MODEL_REVISION || 'main';
if (requestedRevision !== 'main' && !/^[a-f0-9]{40}$/.test(requestedRevision)) throw new Error('Informe commit SHA completo (40 hex).');
const infoResponse = await fetch(`https://huggingface.co/api/models/${modelId}/revision/${requestedRevision}`, { signal: AbortSignal.timeout(30_000) });
if (!infoResponse.ok) throw new Error(`Metadados indisponíveis (${infoResponse.status}).`);
const info = await infoResponse.json();
const revision = info.sha;
if (typeof revision !== 'string' || !/^[a-f0-9]{40}$/.test(revision) || (requestedRevision !== 'main' && revision !== requestedRevision)) throw new Error('Revisão imutável não confirmada.');
const available = new Set((info.siblings || []).map(item => item.rfilename));
const required = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx'];
for (const name of required) if (!available.has(name)) throw new Error(`Arquivo obrigatório ausente: ${name}.`);
const files = [...required, ...['special_tokens_map.json', 'vocab.txt', 'sentencepiece.bpe.model'].filter(name => available.has(name))];
const modelRoot = resolve(process.env.EMBEDDING_CACHE_PATH || '.models', modelId);
const destination = resolve(modelRoot, revision);

async function hashFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function persistPin() {
  const envPath = resolve('.env');
  let source;
  try { source = await readFile(envPath, 'utf8'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    process.stdout.write(`Configure EMBEDDING_MODEL_REVISION=${revision} no ambiente.\n`);
    return;
  }
  const line = `EMBEDDING_MODEL_REVISION=${revision}`;
  const updated = /^EMBEDDING_MODEL_REVISION=.*$/m.test(source) ? source.replace(/^EMBEDDING_MODEL_REVISION=.*$/m, line) : `${source.trimEnd()}\n${line}\n`;
  if (source === updated) return;
  const temporary = `${envPath}.embedding-${revision}.tmp`;
  await writeFile(temporary, updated, { flag: 'wx', mode: 0o600 });
  await rename(temporary, envPath);
}

let existing;
try { existing = JSON.parse(await readFile(resolve(destination, 'embedding-manifest.json'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (existing) {
  if (existing.modelId !== modelId || existing.revision !== revision || existing.dtype !== 'q8' || existing.dimension !== 384 || !Array.isArray(existing.files) || existing.files.length !== files.length) throw new Error('Manifest existente incompatível; cache preservado.');
  for (const name of files) {
    const entry = existing.files.find(item => item.path === name);
    if (!entry || await hashFile(resolve(destination, name)) !== entry.sha256) throw new Error(`Checksum inválido: ${name}; cache preservado.`);
  }
  await persistPin();
  process.stdout.write(`Revisão ${revision} já instalada e verificada.\n`);
  process.exit(0);
}

await mkdir(modelRoot, { recursive: true, mode: 0o700 });
const staging = await mkdtemp(resolve(modelRoot, `${revision}.partial-`));
let totalBytes = 0;
const checksums = [];
try {
  for (const name of files) {
    const response = await fetch(`https://huggingface.co/${modelId}/resolve/${revision}/${name}`, { signal: AbortSignal.timeout(600_000) });
    if (!response.ok || !response.body) throw new Error(`Download falhou: ${name} (${response.status}).`);
    const target = resolve(staging, name);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    const hash = createHash('sha256');
    let fileBytes = 0;
    const inspect = new Transform({
      transform(chunk, _encoding, callback) {
        fileBytes += chunk.length;
        totalBytes += chunk.length;
        if (fileBytes > 256 * 1024 * 1024 || totalBytes > 512 * 1024 * 1024) return callback(new Error('Download excede teto técnico.'));
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(response.body), inspect, createWriteStream(target, { flags: 'wx', mode: 0o600 }));
    checksums.push({ path: name, sha256: hash.digest('hex') });
    process.stdout.write(`Instalado: ${name} (${fileBytes} bytes)\n`);
  }
  const modelConfig = JSON.parse(await readFile(resolve(staging, 'config.json'), 'utf8'));
  if (modelConfig.hidden_size !== 384 || modelConfig.max_position_embeddings < 480) throw new Error('Modelo não corresponde ao contrato embedding384.');
  const manifest = { schemaVersion: 1, modelId, revision, dtype: 'q8', dimension: 384, files: checksums };
  await writeFile(resolve(staging, 'embedding-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  await rename(staging, destination);
  await persistPin();
  process.stdout.write(`Modelo fixado em ${revision}. Reinicie worker; novo fingerprint exige reprocessamento.\n`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
