import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../core/database.service';
import { fail } from '../../core/errors';
import { EmbeddingService } from './embedding.service';

export interface AuthorizedSource {
  documentId: string;
  documentName: string;
  versionId: string;
  chunkId: string;
  pageId: string;
  pageNumber: number;
  position: number;
  content: string;
  tokenCount: number;
  score?: number;
}

@Injectable()
export class RagService {
  constructor(private readonly db: DatabaseService, private readonly embeddings: EmbeddingService) {}

  async search(
    actorId: string,
    workspaceId: string,
    question: string,
    scope: { courseId?: string; documentIds?: string[] },
    limit = 8,
  ): Promise<AuthorizedSource[]> {
    if (!question.trim() || question.length > 8_000) fail(400, 'VALIDATION_FAILED', 'A pergunta é inválida.');
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) fail(400, 'VALIDATION_FAILED', 'Quantidade de fontes inválida.');
    await this.assertRequestedDocuments(actorId, workspaceId, scope.documentIds, scope.courseId);
    const queryEmbedding = await this.embeddings.embedQuery(question);
    const fingerprint = this.embeddings.fingerprint;
    const idFilter = scope.documentIds?.length ? scope.documentIds : null;
    const rows = await this.db.asActor(actorId, (connection) =>
      connection.query<AuthorizedSource & { distance: number }>(
        `SELECT d.id AS "documentId", d.original_name AS "documentName", v.id AS "versionId",
                c.id AS "chunkId", p.id AS "pageId", p.page_number AS "pageNumber", c.position, c.content,
                c.token_count AS "tokenCount", (e.embedding <=> $3::vector) AS distance
         FROM documents d
         JOIN materials m ON m.workspace_id = d.workspace_id AND m.id = d.material_id
         JOIN document_versions v ON v.workspace_id = d.workspace_id AND v.id = d.active_version_id AND v.status = 'READY'
         JOIN document_pages p ON p.workspace_id = v.workspace_id AND p.version_id = v.id
         JOIN document_chunks c ON c.workspace_id = p.workspace_id AND c.page_id = p.id AND c.version_id = v.id
         JOIN document_chunk_embeddings e ON e.workspace_id = c.workspace_id AND e.chunk_id = c.id AND e.embedding_fingerprint = $4
         WHERE d.workspace_id = $1 AND d.status = 'READY' AND d.deleted_at IS NULL
           AND ($5::uuid IS NULL OR m.course_id = $5::uuid)
           AND ($6::uuid[] IS NULL OR d.id = ANY($6::uuid[]))
           AND (d.owner_user_id = $2 OR (m.classification = 'ACADEMIC' AND EXISTS (
             SELECT 1 FROM material_class_releases r
             JOIN enrollments en ON en.workspace_id = r.workspace_id AND en.class_id = r.class_id
             WHERE r.workspace_id = d.workspace_id AND r.material_id = m.id AND r.revoked_at IS NULL
               AND en.user_id = $2 AND en.role = 'STUDENT' AND en.status = 'ACTIVE'
           )))
         ORDER BY e.embedding <=> $3::vector, d.id, p.page_number, c.position
         LIMIT $7`,
        [workspaceId, actorId, this.vectorLiteral(queryEmbedding.vector), fingerprint, scope.courseId ?? null, idFilter, limit],
      ),
    );
    return rows.map(({ distance, ...source }) => ({ ...source, score: 1 - Number(distance) }));
  }

  async loadCorpus(
    actorId: string,
    workspaceId: string,
    scope: { courseId?: string; documentIds?: string[] },
    maxChunks = 60,
  ): Promise<{ sources: AuthorizedSource[]; totalChunks: number; complete: boolean }> {
    await this.assertRequestedDocuments(actorId, workspaceId, scope.documentIds, scope.courseId);
    const idFilter = scope.documentIds?.length ? scope.documentIds : null;
    const result = await this.db.asActor(actorId, async (connection) => {
      const eligibility = await connection.query<{ id: string; total: number }>(
        `SELECT d.id, COUNT(c.id)::int AS total
         FROM documents d
         JOIN materials m ON m.workspace_id = d.workspace_id AND m.id = d.material_id
         JOIN document_versions v ON v.workspace_id = d.workspace_id AND v.id = d.active_version_id AND v.status = 'READY'
         JOIN document_pages p ON p.workspace_id = v.workspace_id AND p.version_id = v.id
         JOIN document_chunks c ON c.workspace_id = p.workspace_id AND c.page_id = p.id
         WHERE d.workspace_id = $1 AND d.status = 'READY' AND d.deleted_at IS NULL
           AND ($3::uuid IS NULL OR m.course_id = $3::uuid) AND ($4::uuid[] IS NULL OR d.id = ANY($4::uuid[]))
           AND (d.owner_user_id = $2 OR (m.classification = 'ACADEMIC' AND EXISTS (
             SELECT 1 FROM material_class_releases r
             JOIN enrollments en ON en.workspace_id = r.workspace_id AND en.class_id = r.class_id
             WHERE r.workspace_id = d.workspace_id AND r.material_id = m.id AND r.revoked_at IS NULL
               AND en.user_id = $2 AND en.role = 'STUDENT' AND en.status = 'ACTIVE'
           )))
         GROUP BY d.id`,
        [workspaceId, actorId, scope.courseId ?? null, idFilter],
      );
      const totalChunks = eligibility.reduce((sum, row) => sum + Number(row.total), 0);
      if (scope.documentIds?.length && eligibility.length !== scope.documentIds.length) {
        fail(404, 'RESOURCE_NOT_FOUND', 'Um ou mais materiais selecionados não estão disponíveis.');
      }
      const sources = await connection.query<AuthorizedSource>(
        `SELECT d.id AS "documentId", d.original_name AS "documentName", v.id AS "versionId",
                c.id AS "chunkId", p.id AS "pageId", p.page_number AS "pageNumber", c.position, c.content,
                c.token_count AS "tokenCount"
         FROM documents d
         JOIN materials m ON m.workspace_id = d.workspace_id AND m.id = d.material_id
         JOIN document_versions v ON v.workspace_id = d.workspace_id AND v.id = d.active_version_id AND v.status = 'READY'
         JOIN document_pages p ON p.workspace_id = v.workspace_id AND p.version_id = v.id
         JOIN document_chunks c ON c.workspace_id = p.workspace_id AND c.page_id = p.id
         WHERE d.workspace_id = $1 AND d.status = 'READY' AND d.deleted_at IS NULL
           AND ($3::uuid IS NULL OR m.course_id = $3::uuid) AND ($4::uuid[] IS NULL OR d.id = ANY($4::uuid[]))
           AND (d.owner_user_id = $2 OR (m.classification = 'ACADEMIC' AND EXISTS (
             SELECT 1 FROM material_class_releases r
             JOIN enrollments en ON en.workspace_id = r.workspace_id AND en.class_id = r.class_id
             WHERE r.workspace_id = d.workspace_id AND r.material_id = m.id AND r.revoked_at IS NULL
               AND en.user_id = $2 AND en.role = 'STUDENT' AND en.status = 'ACTIVE'
           )))
         ORDER BY d.id, p.page_number, c.position LIMIT $5`,
        [workspaceId, actorId, scope.courseId ?? null, idFilter, maxChunks],
      );
      return { sources, totalChunks };
    });
    return { ...result, complete: result.sources.length >= result.totalChunks };
  }

  async assertRequestedDocuments(actorId: string, workspaceId: string, documentIds?: string[], courseId?: string): Promise<void> {
    if (!documentIds?.length) return;
    if (documentIds.length > 20 || new Set(documentIds).size !== documentIds.length) fail(400, 'VALIDATION_FAILED', 'A lista de materiais é inválida.');
    const rows = await this.db.asActor(actorId, (connection) =>
      connection.query<{ id: string; status: string }>(
        `SELECT d.id, d.status FROM documents d JOIN materials m ON m.workspace_id = d.workspace_id AND m.id = d.material_id
         WHERE d.workspace_id = $1 AND d.id = ANY($2::uuid[]) AND d.deleted_at IS NULL
           AND ($3::uuid IS NULL OR m.course_id = $3::uuid)`,
        [workspaceId, documentIds, courseId ?? null],
      ),
    );
    if (rows.length !== documentIds.length) fail(404, 'RESOURCE_NOT_FOUND', 'Um ou mais materiais selecionados não estão disponíveis.');
    if (rows.some((row) => row.status !== 'READY')) fail(409, 'DOCUMENT_NOT_READY', 'Um ou mais materiais ainda estão sendo processados.');
  }

  async reauthorizeSources(actorId: string, workspaceId: string, sources: Array<Pick<AuthorizedSource, 'documentId' | 'versionId' | 'chunkId' | 'pageNumber'>>): Promise<void> {
    if (!sources.length) return;
    const rows = await this.db.asActor(actorId, (connection) => connection.query<{ count: number }>(
      `WITH requested AS (
         SELECT * FROM jsonb_to_recordset($2::jsonb) AS s(document_id uuid, version_id uuid, chunk_id uuid, page_number integer)
       )
       SELECT COUNT(*)::int AS count
       FROM requested s
       JOIN documents d ON d.workspace_id = $1 AND d.id = s.document_id AND d.active_version_id = s.version_id AND d.status = 'READY' AND d.deleted_at IS NULL
       JOIN materials m ON m.workspace_id = d.workspace_id AND m.id = d.material_id
       JOIN document_versions v ON v.workspace_id = d.workspace_id AND v.id = s.version_id AND v.document_id = d.id AND v.status = 'READY'
       JOIN document_chunks c ON c.workspace_id = v.workspace_id AND c.version_id = v.id AND c.id = s.chunk_id
       JOIN document_pages p ON p.workspace_id = v.workspace_id AND p.version_id = v.id AND p.id = c.page_id AND p.page_number = s.page_number
       WHERE intelligence_can_read_document(d.workspace_id, d.id)`,
      [workspaceId, JSON.stringify(sources.map((source) => ({
        document_id: source.documentId, version_id: source.versionId, chunk_id: source.chunkId, page_number: source.pageNumber,
      })))],
    ));
    if (Number(rows[0]?.count ?? 0) !== sources.length) {
      fail(404, 'CONTEXT_REVOKED', 'Uma ou mais fontes não estão mais disponíveis.');
    }
  }

  async buildContext(sources: AuthorizedSource[]): Promise<string> {
    return sources.map((source, index) =>
      `[SOURCE_${index + 1}]\nMaterial: ${source.documentName}\nPágina: ${source.pageNumber}\nTexto não confiável do material:\n${source.content}`,
    ).join('\n\n');
  }

  private vectorLiteral(vector: number[]): string {
    return `[${vector.map((value) => Number(value).toFixed(8)).join(',')}]`;
  }
}
