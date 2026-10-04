import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from './core/public.decorator';
import { DatabaseService } from './core/database.service';
import { WorkerHealthService } from './core/worker-health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService, private readonly workers: WorkerHealthService) {}

  @Public()
  @Get()
  health() {
    return this.snapshot();
  }

  @Public()
  @Get('live')
  liveProbe() {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  ready() {
    return this.snapshot();
  }

  private async snapshot() {
    try {
      await this.db.checkReady();
      const [queue, worker] = await Promise.all([
        this.db.query<{ queued_count: string | number; oldest_queued_age_seconds: string | number | null }>(
          'SELECT queued_count, oldest_queued_age_seconds FROM public.health_queue_metrics()',
        ),
        this.workers.snapshot(),
      ]);
      return {
        status: 'ready',
        worker,
        queue: {
          queuedCount: Number(queue[0]?.queued_count ?? 0),
          oldestQueuedAgeSeconds: queue[0]?.oldest_queued_age_seconds == null
            ? null
            : Number(queue[0].oldest_queued_age_seconds),
        },
      };
    } catch {
      throw new ServiceUnavailableException();
    }
  }
}
