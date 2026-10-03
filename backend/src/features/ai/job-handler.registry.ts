import { Injectable } from '@nestjs/common';
import { fail } from '../../core/errors';
import { IntelligenceJob, IntelligenceJobHandler } from './job.types';

@Injectable()
export class JobHandlerRegistry {
  private readonly handlers = new Map<string, IntelligenceJobHandler>();

  register(feature: string, handler: IntelligenceJobHandler): void {
    if (this.handlers.has(feature)) fail(500, 'JOB_HANDLER_DUPLICATE', 'Há mais de um processador para esta operação.');
    this.handlers.set(feature, handler);
  }

  has(feature: string): boolean {
    return this.handlers.has(feature);
  }

  execute(job: IntelligenceJob): Promise<Record<string, unknown>> {
    const handler = this.handlers.get(job.feature);
    if (!handler) fail(500, 'JOB_HANDLER_UNAVAILABLE', 'O processamento ainda não está disponível.');
    return handler(job);
  }
}
