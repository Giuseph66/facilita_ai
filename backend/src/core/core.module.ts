import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditService } from './audit.service';
import { DatabaseService } from './database.service';
import { QuotaService } from './quota.service';
import { RateLimitService } from './rate-limit.service';
import { SessionGuard } from './session.guard';
import { StorageService } from './storage.service';
import { WorkerHealthService } from './worker-health.service';

@Global()
@Module({
  providers: [
    DatabaseService,
    SessionGuard,
    RateLimitService,
    QuotaService,
    StorageService,
    WorkerHealthService,
    AuditService,
    { provide: APP_GUARD, useExisting: SessionGuard },
  ],
  exports: [DatabaseService, SessionGuard, QuotaService, StorageService, AuditService, RateLimitService, WorkerHealthService],
})
export class CoreModule {}
