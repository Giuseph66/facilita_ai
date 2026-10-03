import { Injectable } from '@nestjs/common';
import { DatabaseService } from './database.service';

export interface AuditEventInput {
  actorId: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  workspaceId?: string;
  requestId?: string;
  jobId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

@Injectable()
export class AuditService {
  constructor(private readonly db: DatabaseService) {}

  async record(event: AuditEventInput): Promise<void> {
    const metadata = event.metadata ?? {};
    const safeMetadata = Object.fromEntries(
      Object.entries(metadata).filter(([key]) => !/(token|secret|password|key|prompt|content|body)/i.test(key)),
    );
    await this.db.asActor(event.actorId, async (connection) => {
      await connection.query(
        `INSERT INTO audit_events
           (actor_id, action, resource_type, resource_id, workspace_id, request_id, job_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
        [event.actorId, event.action, event.resourceType ?? null, event.resourceId ?? null,
          event.workspaceId ?? null, event.requestId ?? null, event.jobId ?? null, JSON.stringify(safeMetadata)],
      );
    });
  }
}
