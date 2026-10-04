import { afterEach, describe, expect, it, vi } from 'vitest';
import type Redis from 'ioredis';
import { WorkerHealthService } from '../../src/core/worker-health.service';

const previousRedisUrl = process.env.REDIS_URL;
afterEach(() => {
  if (previousRedisUrl === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = previousRedisUrl;
});

function fakeRedis(status: string, scan: () => Promise<[string, string[]]>) {
  return {
    status,
    connect: vi.fn(async () => undefined),
    scan: vi.fn(scan),
    mget: vi.fn(async () => []),
    disconnect: vi.fn(() => undefined),
  } as unknown as Redis;
}

describe('recuperação das métricas de saúde do worker', () => {
  it('cria conexão nova após falha Redis e volta a obter métricas no pedido seguinte', async () => {
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';
    const service = new WorkerHealthService();
    const brokenHandle: { redis?: Redis } = {};
    const broken = fakeRedis('ready', async () => {
      (brokenHandle.redis as unknown as { status: string }).status = 'end';
      throw new Error('connection lost');
    });
    brokenHandle.redis = broken;
    const recovered = fakeRedis('ready', async () => ['0', []]);
    const internals = service as unknown as { createRedis: (url: string) => Redis; redis?: Redis };
    internals.createRedis = vi.fn().mockReturnValueOnce(broken).mockReturnValueOnce(recovered);

    await expect(service.snapshot()).resolves.toMatchObject({ status: 'unknown', activeCount: null });
    expect(broken.disconnect).toHaveBeenCalledOnce();
    await expect(service.snapshot()).resolves.toEqual({ status: 'stale', activeCount: 0, oldestHeartbeatAgeSeconds: null });
    expect(internals.createRedis).toHaveBeenCalledTimes(2);
  });

  it('descarta conexão já encerrada antes de iniciar novo snapshot', async () => {
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';
    const service = new WorkerHealthService();
    const ended = fakeRedis('end', async () => { throw new Error('must not use ended client'); });
    const recovered = fakeRedis('ready', async () => ['0', []]);
    const internals = service as unknown as { createRedis: (url: string) => Redis; redis?: Redis };
    internals.redis = ended;
    internals.createRedis = vi.fn().mockReturnValue(recovered);

    await expect(service.snapshot()).resolves.toEqual({ status: 'stale', activeCount: 0, oldestHeartbeatAgeSeconds: null });
    expect(ended.scan).not.toHaveBeenCalled();
    expect(internals.createRedis).toHaveBeenCalledOnce();
  });
});
