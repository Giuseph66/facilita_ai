import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

const HEARTBEAT_TTL_MS = 45_000;

export type WorkerHealthMetrics = {
  status: 'active' | 'stale' | 'unknown';
  activeCount: number | null;
  oldestHeartbeatAgeSeconds: number | null;
};

@Injectable()
export class WorkerHealthService implements OnModuleDestroy {
  private redis?: Redis;

  async snapshot(): Promise<WorkerHealthMetrics> {
    let redis: Redis | undefined;
    try {
      redis = this.connection();
      if (redis.status === 'wait') await redis.connect();
      const prefix = process.env.QUEUE_PREFIX?.trim() || 'facilita';
      const pattern = `${prefix}:health:worker:*`;
      const keys: string[] = [];
      let cursor = '0';
      do {
        const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = result[0];
        keys.push(...result[1]);
      } while (cursor !== '0' && keys.length < 2_000);
      const values = keys.length ? await redis.mget(...keys) : [];
      const now = Date.now();
      const ages = values.flatMap((value) => {
        const timestamp = Number(value);
        const age = now - timestamp;
        return Number.isSafeInteger(timestamp) && age >= 0 && age < HEARTBEAT_TTL_MS ? [age] : [];
      });
      const activeCount = ages.length;
      return {
        status: activeCount ? 'active' : 'stale',
        activeCount,
        oldestHeartbeatAgeSeconds: activeCount ? Math.floor(Math.max(...ages) / 1_000) : null,
      };
    } catch {
      if (redis && this.redis === redis) {
        this.redis = undefined;
        redis.disconnect();
      }
      return { status: 'unknown', activeCount: null, oldestHeartbeatAgeSeconds: null };
    }
  }

  onModuleDestroy(): void {
    this.redis?.disconnect();
    this.redis = undefined;
  }

  private connection(): Redis {
    if (this.redis?.status === 'end') this.redis = undefined;
    if (!this.redis) {
      const url = process.env.REDIS_URL;
      if (!url) throw new Error('REDIS_URL is required');
      this.redis = this.createRedis(url);
    }
    return this.redis;
  }

  private createRedis(url: string): Redis {
    return new Redis(url, {
      lazyConnect: true,
      connectTimeout: 1_000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
  }
}
