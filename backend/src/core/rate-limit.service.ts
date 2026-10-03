import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService } from './database.service';
import { fail } from './errors';

@Injectable()
export class RateLimitService {
  constructor(private readonly db: DatabaseService) {}

  async enforce(scope: string, identity: string, maxAttempts: number, windowSeconds: number): Promise<void> {
    const bucketKey = createHash('sha256').update(scope + '\0' + identity).digest('hex');
    const rows = await this.db.query<{ attempts: number }>(
      `INSERT INTO rate_limit_buckets (bucket_key, window_start, attempts, expires_at)
       VALUES ($1, to_timestamp(floor(extract(epoch FROM now()) / $2) * $2), 1,
               to_timestamp(floor(extract(epoch FROM now()) / $2) * $2) + ($2 * interval '1 second'))
       ON CONFLICT (bucket_key, window_start)
       DO UPDATE SET attempts = rate_limit_buckets.attempts + 1
       RETURNING attempts`,
      [bucketKey, windowSeconds],
    );
    if ((rows[0]?.attempts ?? maxAttempts + 1) > maxAttempts) {
      fail(429, 'RATE_LIMITED', 'Muitas tentativas. Aguarde um pouco e tente novamente.');
    }
    if (Math.random() < 0.01) {
      await this.db.query('DELETE FROM rate_limit_buckets WHERE expires_at < now()');
    }
  }
}
