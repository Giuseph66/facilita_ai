import { z } from 'zod';

export type StartupConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  appOrigin: string;
  corsOrigins: string[];
  apiPort: number;
  workerConcurrency: number;
};

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  AI_PROVIDER: z.enum(['ollama', 'ollama-cloud', 'fake']),
  APP_ORIGIN: z.string().optional(),
  API_PORT: z.string().optional(),
  DB_POOL_SIZE: z.string().optional(),
  INTELLIGENCE_CONCURRENCY: z.string().optional(),
  QUEUE_PREFIX: z.string().optional(),
  VAULT_ACTIVE_KEY_ID: z.string().optional(),
  VAULT_KEYS_JSON: z.string().optional(),
}).passthrough();

export function validateStartupConfig(
  mode: 'api' | 'worker',
  input: NodeJS.ProcessEnv = process.env,
): StartupConfig {
  const parsed = environmentSchema.safeParse(input);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))].sort();
    throw new Error(`Startup configuration is invalid: ${fields.join(', ')}`);
  }
  const env = parsed.data;
  const databaseUrl = parseUrl(env.DATABASE_URL, ['postgres:', 'postgresql:'], 'DATABASE_URL');
  const redisUrl = parseUrl(env.REDIS_URL, ['redis:', 'rediss:'], 'REDIS_URL');
  if (!databaseUrl.hostname || !redisUrl.hostname) throw new Error('Startup configuration is invalid: DATABASE_URL, REDIS_URL');
  if (env.NODE_ENV === 'production' && env.AI_PROVIDER === 'fake') {
    throw new Error('Startup configuration is invalid: AI_PROVIDER');
  }

  const appPort = readInteger(env.API_PORT, 3001, 1, 65_535, 'API_PORT');
  readInteger(env.DB_POOL_SIZE, 10, 1, 100, 'DB_POOL_SIZE');
  const workerConcurrency = readInteger(env.INTELLIGENCE_CONCURRENCY, 2, 1, 32, 'INTELLIGENCE_CONCURRENCY');
  const queuePrefix = env.QUEUE_PREFIX?.trim() || 'facilita';
  if (queuePrefix.length > 100 || !/^[A-Za-z0-9:_-]+$/.test(queuePrefix)) {
    throw new Error('Startup configuration is invalid: QUEUE_PREFIX');
  }
  validateVault(env.VAULT_ACTIVE_KEY_ID, env.VAULT_KEYS_JSON);

  if (mode === 'worker' && !env.REDIS_URL) throw new Error('Startup configuration is invalid: REDIS_URL');
  if (env.NODE_ENV === 'production' && !env.APP_ORIGIN) {
    throw new Error('Startup configuration is invalid: APP_ORIGIN');
  }
  const configuredOrigin = env.APP_ORIGIN?.trim();
  const appOrigin = configuredOrigin
    ? parseOrigin(configuredOrigin, env.NODE_ENV === 'production')
    : env.NODE_ENV === 'production' ? '' : 'http://localhost:3000';
  const corsOrigins = appOrigin
    ? allowedOrigins(appOrigin, env.NODE_ENV !== 'production')
    : [];

  return { nodeEnv: env.NODE_ENV, appOrigin, corsOrigins, apiPort: appPort, workerConcurrency };
}

export function sameOrigin(actual: string | undefined, expected: string | undefined, allowLocalAlias: boolean): boolean {
  const actualOrigin = normalizeOrigin(actual);
  const expectedOrigin = normalizeOrigin(expected);
  if (!actualOrigin || !expectedOrigin) return false;
  if (actualOrigin === expectedOrigin) return true;
  if (!allowLocalAlias) return false;
  const actualUrl = new URL(actualOrigin);
  const expectedUrl = new URL(expectedOrigin);
  const localHosts = new Set(['localhost', '127.0.0.1']);
  return localHosts.has(actualUrl.hostname) && localHosts.has(expectedUrl.hostname) &&
    actualUrl.protocol === expectedUrl.protocol && actualUrl.port === expectedUrl.port;
}

function parseUrl(value: string, protocols: string[], field: string): URL {
  try {
    const parsed = new URL(value);
    if (!protocols.includes(parsed.protocol)) throw new Error('protocol');
    return parsed;
  } catch {
    throw new Error(`Startup configuration is invalid: ${field}`);
  }
}

function parseOrigin(value: string, production: boolean): string {
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password ||
        parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.origin === 'null' ||
        (production && parsed.protocol !== 'https:')) throw new Error('origin');
    return parsed.origin;
  } catch {
    throw new Error('Startup configuration is invalid: APP_ORIGIN');
  }
}

function normalizeOrigin(value?: string): string | undefined {
  if (!value) return undefined;
  try { return new URL(value).origin; } catch { return undefined; }
}

function allowedOrigins(origin: string, allowLocalAlias: boolean): string[] {
  const origins = [origin];
  if (allowLocalAlias) {
    const url = new URL(origin);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      url.hostname = url.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
      origins.push(url.origin);
    }
  }
  return origins;
}

function readInteger(value: string | undefined, fallback: number, min: number, max: number, field: string): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Startup configuration is invalid: ${field}`);
  }
  return parsed;
}

function validateVault(activeId: string | undefined, keysJson: string | undefined): void {
  if (!activeId || !keysJson) throw new Error('Startup configuration is invalid: VAULT_ACTIVE_KEY_ID, VAULT_KEYS_JSON');
  try {
    const keys = JSON.parse(keysJson) as Record<string, unknown>;
    const encoded = keys[activeId];
    if (typeof encoded !== 'string' || Buffer.from(encoded, 'base64').length !== 32) throw new Error('key');
  } catch {
    throw new Error('Startup configuration is invalid: VAULT_ACTIVE_KEY_ID, VAULT_KEYS_JSON');
  }
}
