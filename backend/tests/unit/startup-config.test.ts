import { describe, expect, it } from 'vitest';
import { sameOrigin, validateStartupConfig } from '../../src/core/startup-config';

const baseEnv = () => ({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://runtime:private@test-db:5432/facilita',
  REDIS_URL: 'redis://test-redis:6379',
  AI_PROVIDER: 'fake',
  VAULT_ACTIVE_KEY_ID: 'test-v1',
  VAULT_KEYS_JSON: JSON.stringify({ 'test-v1': Buffer.alloc(32, 7).toString('base64') }),
});

describe('startup config', () => {
  it('allows the localhost and 127.0.0.1 development origins on the configured port', () => {
    const config = validateStartupConfig('api', { ...baseEnv(), APP_ORIGIN: 'http://localhost:3000' });
    expect(config.corsOrigins).toEqual(['http://localhost:3000', 'http://127.0.0.1:3000']);
    expect(sameOrigin('http://127.0.0.1:3000', 'http://localhost:3000', true)).toBe(true);
    expect(sameOrigin('http://127.0.0.1:3001', 'http://localhost:3000', true)).toBe(false);
  });

  it('keeps production origins exact and requires HTTPS', () => {
    const valid = validateStartupConfig('api', { ...baseEnv(), NODE_ENV: 'production', AI_PROVIDER: 'ollama', APP_ORIGIN: 'https://study.example' });
    expect(valid.corsOrigins).toEqual(['https://study.example']);
    expect(sameOrigin('https://127.0.0.1:3000', 'https://localhost:3000', false)).toBe(false);
    expect(() => validateStartupConfig('api', { ...baseEnv(), NODE_ENV: 'production', AI_PROVIDER: 'ollama', APP_ORIGIN: 'http://study.example' }))
      .toThrow('APP_ORIGIN');
  });

  it('rejects malformed URLs, ports, and vault setup without echoing values', () => {
    expect(() => validateStartupConfig('worker', { ...baseEnv(), REDIS_URL: 'https://secret.invalid' })).toThrow('REDIS_URL');
    expect(() => validateStartupConfig('api', { ...baseEnv(), API_PORT: '65536' })).toThrow('API_PORT');
    expect(() => validateStartupConfig('api', { ...baseEnv(), VAULT_KEYS_JSON: '{secret' })).toThrow('VAULT_ACTIVE_KEY_ID, VAULT_KEYS_JSON');
  });
});
