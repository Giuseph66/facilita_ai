import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../core/database.service';
import { DocumentsService } from './documents/documents.service';

export const INTELLIGENCE_PRIVACY_SERVICE = 'INTELLIGENCE_PRIVACY_SERVICE';

// Alias `a` must be a study_artifacts row. Lost or invisible provenance fails closed.
const authorizedArtifact = `a.invalidated_at IS NULL AND a.source_count>0 AND a.source_count=(
  SELECT count(*) FROM study_artifact_sources s
  JOIN document_versions v ON v.workspace_id=s.workspace_id AND v.id=s.document_version_id
  JOIN documents d ON d.workspace_id=v.workspace_id AND d.id=v.document_id
  WHERE s.workspace_id=a.workspace_id AND s.artifact_id=a.id
    AND d.active_version_id=v.id AND d.status='READY' AND d.deleted_at IS NULL
    AND intelligence_can_read_document(d.workspace_id,d.id)
)`;

@Injectable()
export class IntelligencePrivacyService {
  constructor(private readonly db: DatabaseService, private readonly documents: DocumentsService) {}

  async purgeUser(userId: string): Promise<void> {
    // Storage deletion is idempotent; do it before cascading database rows so retries retain keys.
    await this.documents.purgeUser(userId);
    await this.db.asActor(userId, async connection => {
      await connection.query(`DELETE FROM conversations WHERE owner_user_id = $1`, [userId]);
      await connection.query(`DELETE FROM practice_attempts WHERE user_id = $1`, [userId]);
      await connection.query(`DELETE FROM practice_tests WHERE owner_user_id = $1`, [userId]);
      await connection.query(`DELETE FROM study_artifacts WHERE owner_user_id = $1`, [userId]);
      await connection.query(`DELETE FROM study_blueprints WHERE created_by = $1`, [userId]);
      await connection.query(`DELETE FROM assessments WHERE author_user_id = $1`, [userId]);
      await connection.query(`DELETE FROM jobs WHERE actor_id = $1`, [userId]);
      await connection.query(`DELETE FROM ai_connections WHERE user_id = $1`, [userId]);
      await connection.query(`DELETE FROM ai_preferences WHERE user_id = $1`, [userId]);
      await connection.query(`DELETE FROM ai_usage_events WHERE actor_id = $1`, [userId]);
    });
  }

  async exportUser(userId: string): Promise<unknown> {
    return this.db.asActor(userId, async connection => {
      const [connections, preferences, usage, documents, conversations, messages, artifacts, assessments, questions, answers, attempts, jobs, exports] = await Promise.all([
        connection.query(`SELECT provider, masked_suffix AS "maskedKey", status, checked_at AS "checkedAt", created_at AS "createdAt" FROM ai_connections WHERE user_id=$1`, [userId]),
        connection.query(`SELECT mode, preferred_model AS "preferredModel", updated_at AS "updatedAt" FROM ai_preferences WHERE user_id=$1`, [userId]),
        connection.query(`SELECT operation_id AS "operationId", attempt, payer_scope AS "payerScope", provider, model, feature, input_tokens AS "inputTokens", cached_input_tokens AS "cachedInputTokens", output_tokens AS "outputTokens", token_source AS "tokenSource", estimated_cost::text AS "estimatedCost", currency, price_version AS "priceVersion", latency_ms AS "latencyMs", success, error_code AS "errorCode", created_at AS "createdAt" FROM ai_usage_events WHERE actor_id=$1 ORDER BY created_at`, [userId]),
        connection.query(`SELECT id, material_id AS "materialId", original_name AS name, mime_type AS "mimeType", size_bytes::text AS "sizeBytes", status, stage, error_code AS "errorCode", created_at AS "createdAt" FROM documents WHERE owner_user_id=$1 ORDER BY created_at`, [userId]),
        connection.query(`SELECT id, workspace_id AS "workspaceId", kind, title, context_revision AS "contextRevision", created_at AS "createdAt", updated_at AS "updatedAt" FROM conversations WHERE owner_user_id=$1 ORDER BY created_at`, [userId]),
        connection.query(`SELECT m.id, m.conversation_id AS "conversationId", m.role, m.content, m.state, m.created_at AS "createdAt"
          FROM messages m JOIN conversations c ON c.workspace_id=m.workspace_id AND c.id=m.conversation_id
          WHERE c.owner_user_id=$1 AND m.invalidated_at IS NULL AND (m.role='USER' OR (m.state='SUCCEEDED' AND m.citation_count=(
            SELECT count(*) FROM message_citations citation
            JOIN document_versions v ON v.workspace_id=citation.workspace_id AND v.id=citation.document_version_id
            JOIN documents d ON d.workspace_id=v.workspace_id AND d.id=v.document_id
            WHERE citation.workspace_id=m.workspace_id AND citation.message_id=m.id
              AND d.active_version_id=v.id AND d.status='READY' AND d.deleted_at IS NULL
              AND intelligence_can_read_document(d.workspace_id,d.id)
          ))) ORDER BY m.created_at`, [userId]),
        connection.query(`SELECT a.id, a.course_id AS "courseId", a.kind, a.title, a.payload, a.schema_version AS "schemaVersion", a.created_at AS "createdAt"
          FROM study_artifacts a WHERE a.owner_user_id=$1 AND ${authorizedArtifact} ORDER BY a.created_at`, [userId]),
        connection.query(`SELECT id, course_id AS "courseId", class_id AS "classId", title, kind, state, revision, family_id AS "familyId", variant_label AS "variantLabel", copied_from_id AS "copiedFromId", created_at AS "createdAt", updated_at AS "updatedAt" FROM assessments WHERE author_user_id=$1 ORDER BY created_at`, [userId]),
        connection.query(`SELECT q.id, q.assessment_id AS "assessmentId", q.position, q.type, q.statement, q.options, q.difficulty, q.points, q.revision FROM assessment_questions q JOIN assessments a ON a.workspace_id=q.workspace_id AND a.id=q.assessment_id WHERE a.author_user_id=$1 ORDER BY a.id,q.position`, [userId]),
        connection.query(`SELECT answer.question_id AS "questionId", answer.correct_option_id AS "correctOptionId", answer.expected_answer AS "expectedAnswer", answer.rubric FROM assessment_answers answer JOIN assessment_questions q ON q.workspace_id=answer.workspace_id AND q.id=answer.question_id JOIN assessments a ON a.workspace_id=q.workspace_id AND a.id=q.assessment_id WHERE a.author_user_id=$1`, [userId]),
        connection.query(`SELECT p.id, p.test_id AS "practiceTestId", p.state, p.answers,
          CASE WHEN ${authorizedArtifact} THEN p.question_snapshot ELSE NULL END AS "questionSnapshot",
          CASE WHEN ${authorizedArtifact} THEN p.result ELSE NULL END AS result,
          p.started_at AS "startedAt", p.submitted_at AS "submittedAt"
          FROM practice_attempts p JOIN practice_tests t ON t.workspace_id=p.workspace_id AND t.id=p.test_id
          LEFT JOIN study_artifacts a ON a.workspace_id=t.workspace_id AND a.id=t.artifact_id
          WHERE p.user_id=$1 ORDER BY p.started_at`, [userId]),
        connection.query(`SELECT id, feature, state, stage, resource_type AS "resourceType", resource_id AS "resourceId", payload, result, error_code AS "errorCode", created_at AS "createdAt", finished_at AS "finishedAt" FROM jobs WHERE actor_id=$1 ORDER BY created_at`, [userId]),
        connection.query(`SELECT id, assessment_id AS "assessmentId", assessment_revision AS revision, format, variant, status, expires_at AS "expiresAt", created_at AS "createdAt" FROM exports WHERE actor_id=$1 ORDER BY created_at`, [userId]),
      ]);
      return { ai: { connections, preferences, usage }, documents, conversations, messages, studyArtifacts: artifacts, assessments: { items: assessments, questions, answers }, practiceAttempts: attempts, jobs, exports };
    });
  }
}
