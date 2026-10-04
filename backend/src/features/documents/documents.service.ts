import { Injectable, OnModuleInit } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseService } from '../../core/database.service';
import { QuotaService } from '../../core/quota.service';
import { RateLimitService } from '../../core/rate-limit.service';
import { StorageService } from '../../core/storage.service';
import { fail } from '../../core/errors';
import { JobHandlerRegistry } from '../ai/job-handler.registry';
import { JobsService } from '../ai/jobs.service';
import { IntelligenceJob, JobView, toJobView } from '../ai/job.types';
import { DocumentParser, ParsedPage } from './document.parser';
import { EmbeddingService } from '../rag/embedding.service';
import { DOCUMENT_CHUNKER_VERSION, DOCUMENT_PARSER_VERSION } from '../pipeline-versions';

const STORAGE_METRIC = 'documents.bytes.monthly';
const LIFETIME_STORAGE_METRIC = 'MAX_STORAGE_BYTES';
const DOCUMENT_COUNT_METRIC = 'MAX_DOCUMENTS';
const MAX_CHUNKS_PER_DOCUMENT = 5_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface DocumentRow {
  id: string;
  workspace_id: string;
  material_id: string;
  course_id?: string | null;
  owner_user_id: string;
  original_storage_key: string;
  original_name: string;
  mime_type: string;
  size_bytes: string | number;
  sha256: string;
  status: string;
  stage: string;
  error_code: string | null;
  active_version_id: string | null;
  deleted_at: Date | null;
  created_at: Date;
}

export interface DocumentView {
  id: string;
  materialId: string;
  courseId: string | null;
  name: string;
  sizeBytes: string;
  format: 'PDF' | 'PPTX';
  status: string;
  stage: string;
  errorCode: string | null;
  activeVersionId: string | null;
  createdAt: string;
}

export interface StoredDocument {
  document: DocumentView;
  job: JobView;
}

type UploadLookup = StoredDocument & { materialId: string; sha256: string };

@Injectable()
export class DocumentsService implements OnModuleInit {
  constructor(
    private readonly db: DatabaseService,
    private readonly quota: QuotaService,
    private readonly rateLimit: RateLimitService,
    private readonly storage: StorageService,
    private readonly parser: DocumentParser,
    private readonly embeddings: EmbeddingService,
    private readonly jobs: JobsService,
    private readonly handlers: JobHandlerRegistry,
  ) {}

  onModuleInit(): void {
    this.handlers.register('DOCUMENT_PROCESS', (job) => this.processJob(job));
    this.handlers.register('DOCUMENT_PURGE', (job) => this.purgeJob(job));
  }

  async upload(
    actorId: string,
    materialId: string,
    file: { buffer: Buffer; originalname: string; size: number } | undefined,
    idempotencyKey?: string,
    ip = 'unknown',
  ): Promise<StoredDocument> {
    this.assertUuid(materialId);
    if (!file?.buffer || !Buffer.isBuffer(file.buffer)) fail(400, 'VALIDATION_FAILED', 'Selecione um arquivo para enviar.');
    await this.rateLimit.enforce('document.upload.ip', ip, 20, 3_600);
    await this.rateLimit.enforce('document.upload.actor', actorId, 40, 3_600);
    const format = this.parser.detectFormat(file.buffer);
    if (idempotencyKey !== undefined && (!idempotencyKey.trim() || idempotencyKey.length > 160)) {
      fail(400, 'VALIDATION_FAILED', 'A chave de idempotência é inválida.');
    }
    const material = await this.authorizedMaterial(actorId, materialId);
    const hash = createHash('sha256').update(file.buffer).digest('hex');
    if (idempotencyKey) {
      const existing = await this.findUpload(actorId, idempotencyKey);
      if (existing) {
        if (existing.materialId !== materialId || existing.sha256 !== hash) {
          fail(409, 'IDEMPOTENCY_CONFLICT', 'A chave de idempotência já foi usada para outro arquivo.');
        }
        await this.commitUploadQuota(actorId, existing.document.id);
        return { document: existing.document, job: existing.job };
      }
    }

    await this.quota.require(actorId, 'MAX_DOCUMENTS');
    const documentId = randomUUID();
    const storageKey = `private/documents/${material.workspace_id}/${documentId}/original`;
    await this.reserveUploadQuota(actorId, documentId, file.buffer.byteLength);
    try {
      await this.storage.put(storageKey, file.buffer);
    } catch {
      if (await this.removeUnregisteredFile(storageKey)) await this.releaseUploadQuota(actorId, documentId).catch(() => undefined);
      else await this.commitUploadQuota(actorId, documentId).catch(() => undefined);
      fail(503, 'STORAGE_OPERATION_FAILED', 'Não foi possível guardar o arquivo com segurança.');
    }

    let stored: StoredDocument & { created: boolean };
    try {
      stored = await this.db.asActor(actorId, async (connection): Promise<StoredDocument & { created: boolean }> => {
        if (idempotencyKey) {
          await connection.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`${actorId}:document-upload:${idempotencyKey}`]);
          const duplicate = await connection.query<DocumentRow>(
            `SELECT id, workspace_id, material_id, owner_user_id, original_storage_key, original_name, mime_type,
                    size_bytes, sha256, status, stage, error_code, active_version_id, deleted_at, created_at
             FROM documents WHERE owner_user_id = $1 AND upload_idempotency_key = $2`, [actorId, idempotencyKey],
          );
          if (duplicate[0]) {
            if (duplicate[0].material_id !== materialId || duplicate[0].sha256 !== hash) {
              fail(409, 'IDEMPOTENCY_CONFLICT', 'A chave de idempotência já foi usada para outro arquivo.');
            }
            const job = await this.jobForDocument(connection, actorId, duplicate[0].id, 'DOCUMENT_PROCESS');
            if (!job) fail(409, 'JOB_NOT_AVAILABLE', 'O arquivo foi recebido; solicite o status novamente.');
            return { document: this.view(duplicate[0]), job, created: false };
          }
        }
        await connection.query(
          `INSERT INTO documents (id, workspace_id, material_id, owner_user_id, original_storage_key, original_name,
             mime_type, size_bytes, sha256, upload_idempotency_key, status, stage)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'QUEUED','QUEUED')`,
          [documentId, material.workspace_id, materialId, actorId, storageKey, this.safeFileName(file.originalname),
            format === 'PDF' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            file.buffer.byteLength, hash, idempotencyKey ?? null],
        );
        const job = await this.jobs.createInConnection(actorId, material.workspace_id, 'DOCUMENT_PROCESS', {
          resourceType: 'DOCUMENT', resourceId: documentId, operation: 'INGEST',
        }, idempotencyKey, connection);
        const rows = await connection.query<DocumentRow>(
          `SELECT id, workspace_id, material_id, owner_user_id, original_storage_key, original_name, mime_type,
                  size_bytes, sha256, status, stage, error_code, active_version_id, deleted_at, created_at
           FROM documents WHERE id = $1 AND owner_user_id = $2`, [documentId, actorId],
        );
        if (!rows[0]) fail(500, 'DOCUMENT_CREATE_FAILED', 'Não foi possível registrar o arquivo.');
        return { document: this.view(rows[0]), job, created: true };
      });
    } catch (error) {
      const removed = await this.removeUnregisteredFile(storageKey);
      if (removed) await this.releaseUploadQuota(actorId, documentId).catch(() => undefined);
      else await this.commitUploadQuota(actorId, documentId).catch(() => undefined);
      throw error;
    }
    if (!stored.created) {
      const removed = await this.removeUnregisteredFile(storageKey);
      if (removed) await this.releaseUploadQuota(actorId, documentId).catch(() => undefined);
      else await this.commitUploadQuota(actorId, documentId).catch(() => undefined);
      return { document: stored.document, job: stored.job };
    }
    await this.commitUploadQuota(actorId, documentId).catch(() => undefined);
    return { document: stored.document, job: stored.job };
  }

  async listForMaterial(actorId: string, materialId: string, cursor?: string): Promise<{ items: DocumentView[]; nextCursor: string | null }> {
    this.assertUuid(materialId);
    const offset = this.offsetFromCursor(cursor);
    const rows = await this.db.asActor(actorId, (connection) =>
      connection.query<DocumentRow>(
        `SELECT d.id, d.workspace_id, d.material_id, m.course_id, d.owner_user_id, d.original_storage_key, d.original_name,
                d.mime_type, d.size_bytes, d.sha256, d.status, d.stage, d.error_code, d.active_version_id, d.deleted_at, d.created_at
         FROM documents d JOIN materials m ON m.workspace_id = d.workspace_id AND m.id = d.material_id
         WHERE d.material_id = $1 AND d.deleted_at IS NULL AND m.workspace_id = d.workspace_id
         ORDER BY d.created_at DESC, d.id DESC OFFSET $2 LIMIT 51`, [materialId, offset],
      ),
    );
    const hasMore = rows.length > 50;
    const items = rows.slice(0, 50).map((row) => this.view(row));
    return { items, nextCursor: hasMore ? Buffer.from(String(offset + 50)).toString('base64url') : null };
  }

  async get(actorId: string, documentId: string): Promise<DocumentView> {
    this.assertUuid(documentId);
    const rows = await this.db.asActor(actorId, (connection) =>
      connection.query<DocumentRow>(
        `SELECT d.id, d.workspace_id, d.material_id, m.course_id, d.owner_user_id, d.original_storage_key, d.original_name,
                d.mime_type, d.size_bytes, d.sha256, d.status, d.stage, d.error_code, d.active_version_id, d.deleted_at, d.created_at
         FROM documents d LEFT JOIN materials m ON m.workspace_id = d.workspace_id AND m.id = d.material_id
         WHERE d.id = $1 AND d.deleted_at IS NULL`, [documentId],
      ),
    );
    if (!rows[0]) fail(404, 'RESOURCE_NOT_FOUND', 'O documento solicitado não está disponível.');
    return this.view(rows[0]);
  }

  async download(actorId: string, documentId: string): Promise<{ buffer: Buffer; name: string; mimeType: string }> {
    this.assertUuid(documentId);
    const rows = await this.db.asActor(actorId, (connection) =>
      connection.query<DocumentRow>(
        `SELECT id, workspace_id, material_id, owner_user_id, original_storage_key, original_name, mime_type,
                size_bytes, sha256, status, stage, error_code, active_version_id, deleted_at, created_at
         FROM documents WHERE id = $1 AND deleted_at IS NULL`, [documentId],
      ),
    );
    const document = rows[0];
    if (!document) fail(404, 'RESOURCE_NOT_FOUND', 'O documento solicitado não está disponível.');
    let buffer: Buffer;
    try { buffer = await this.storage.get(document.original_storage_key); }
    catch { fail(503, 'STORAGE_OPERATION_FAILED', 'O arquivo está temporariamente indisponível.'); }
    const stillAuthorized = await this.db.asActor(actorId, (connection) =>
      connection.query<{ id: string }>(
        `SELECT id FROM documents WHERE id=$1 AND original_storage_key=$2 AND deleted_at IS NULL`,
        [document.id, document.original_storage_key],
      ),
    );
    if (!stillAuthorized[0]) fail(404, 'RESOURCE_NOT_FOUND', 'O documento solicitado não está disponível.');
    return { buffer, name: document.original_name, mimeType: document.mime_type };
  }

  async reprocess(actorId: string, documentId: string, idempotencyKey?: string): Promise<JobView> {
    this.assertUuid(documentId);
    return this.db.asActor(actorId, async (connection) => {
      const rows = await connection.query<DocumentRow>(
        `SELECT id, workspace_id, material_id, owner_user_id, original_storage_key, original_name, mime_type,
                size_bytes, sha256, status, stage, error_code, active_version_id, deleted_at, created_at
         FROM documents WHERE id = $1 AND owner_user_id = $2 AND deleted_at IS NULL FOR UPDATE`, [documentId, actorId],
      );
      const document = rows[0];
      if (!document) fail(404, 'RESOURCE_NOT_FOUND', 'O documento solicitado não está disponível.');
      if (document.status === 'PROCESSING' || document.status === 'QUEUED') fail(409, 'JOB_ALREADY_ACTIVE', 'O documento já está sendo processado.');
      return this.jobs.createInConnection(actorId, document.workspace_id, 'DOCUMENT_PROCESS', {
        resourceType: 'DOCUMENT', resourceId: documentId, operation: 'REPROCESS',
      }, idempotencyKey, connection);
    });
  }

  async requestDelete(actorId: string, documentId: string, idempotencyKey?: string): Promise<JobView> {
    this.assertUuid(documentId);
    return this.db.asActor(actorId, async (connection) => {
      const rows = await connection.query<DocumentRow>(
        `SELECT id, workspace_id, material_id, owner_user_id, original_storage_key, original_name, mime_type,
                size_bytes, sha256, status, stage, error_code, active_version_id, deleted_at, created_at
         FROM documents WHERE id = $1 AND owner_user_id = $2 FOR UPDATE`, [documentId, actorId],
      );
      const document = rows[0];
      if (!document) fail(404, 'RESOURCE_NOT_FOUND', 'O documento solicitado não está disponível.');
      if (document.deleted_at) {
        const active = await this.jobForDocument(connection, actorId, documentId, 'DOCUMENT_PURGE');
        if (active) return active;
      }
      await connection.query(`SELECT public.invalidate_document_intelligence($1)`, [documentId]);
      await connection.query(
        `UPDATE documents SET status = 'DELETING', stage = 'DELETING', deleted_at = COALESCE(deleted_at, now()), updated_at = now()
         WHERE id = $1 AND owner_user_id = $2`, [documentId, actorId],
      );
      return this.jobs.createInConnection(actorId, document.workspace_id, 'DOCUMENT_PURGE', {
        resourceType: 'DOCUMENT', resourceId: documentId, storageBytes: Number(document.size_bytes),
      }, idempotencyKey ?? `purge:${documentId}`, connection);
    });
  }

  async purgeUser(actorId: string): Promise<void> {
    const docs = await this.db.asActor(actorId, (connection) =>
      connection.query<{ id: string; original_storage_key: string; size_bytes: string | number }>(
        `SELECT id, original_storage_key, size_bytes FROM documents WHERE owner_user_id = $1`, [actorId],
      ),
    );
    const files = await this.db.asActor(actorId, (connection) =>
      connection.query<{ id: string; storage_key: string | null }>(`SELECT id, storage_key FROM exports WHERE actor_id = $1`, [actorId]),
    );
    await this.db.asActor(actorId, async connection => {
      for (const doc of docs) await connection.query(`SELECT public.invalidate_document_intelligence($1)`, [doc.id]);
      if (docs.length) {
        await connection.query(
          `UPDATE documents SET status='DELETING',stage='DELETING',deleted_at=COALESCE(deleted_at,now()),updated_at=now()
           WHERE owner_user_id=$1`, [actorId],
        );
      }
    });
    for (const row of [...docs.map((doc) => ({ key: doc.original_storage_key })), ...files.flatMap((file) => file.storage_key ? [{ key: file.storage_key }] : [])]) {
      await this.storage.remove(row.key);
    }
    for (const doc of docs) await this.releaseLifetimeQuota(actorId, doc.id);
    await this.db.asActor(actorId, async (connection) => {
      await connection.query(`DELETE FROM documents WHERE owner_user_id = $1`, [actorId]);
      await connection.query(`DELETE FROM exports WHERE actor_id = $1`, [actorId]);
    });
  }

  async processJob(job: IntelligenceJob): Promise<Record<string, unknown>> {
    const operation = job.payload.operation;
    if (operation === 'PURGE') return this.purgeJob(job);
    const documentId = job.resource_id;
    if (!documentId || !UUID.test(documentId)) fail(404, 'RESOURCE_NOT_FOUND', 'O documento solicitado não está disponível.');
    let versionId: string | undefined;
    try {
      const document = await this.documentForProcessing(job.actor_id, documentId);
      if (document.deleted_at) fail(404, 'RESOURCE_NOT_FOUND', 'O documento solicitado não está disponível.');
      await this.commitUploadQuota(job.actor_id, document.id);
      await this.setDocumentStage(job.actor_id, documentId, 'PROCESSING', 'EXTRACTING');
      const original = await this.storage.get(document.original_storage_key).catch(() => fail(503, 'STORAGE_OPERATION_FAILED', 'O arquivo está temporariamente indisponível.'));
      const parsed = await this.parser.parse(original, document.mime_type === 'application/pdf' ? 'PDF' : 'PPTX');
      const fingerprint = this.embeddings.fingerprint;
      const version = await this.getOrCreateVersion(job, documentId, fingerprint);
      versionId = version.id;
      if (version.status === 'READY') return { documentId, versionId, status: 'READY' };
      const pageChunks: Array<{ page: ParsedPage; chunks: Array<{ text: string; tokenCount: number; vector: number[]; hash: string }> }> = [];
      let totalChunks = 0;
      for (const page of parsed.pages) {
        const texts = await this.chunkPage(page.text);
        totalChunks += texts.length;
        if (totalChunks > MAX_CHUNKS_PER_DOCUMENT) fail(413, 'DOCUMENT_CHUNK_LIMIT', 'O documento excede o limite de trechos processáveis.');
        const chunks = [];
        for (const text of texts) {
          const embedded = await this.embeddings.embedPassage(text);
          chunks.push({ text, tokenCount: embedded.tokenCount, vector: embedded.vector, hash: createHash('sha256').update(text).digest('hex') });
        }
        pageChunks.push({ page, chunks });
      }
      await this.setDocumentStage(job.actor_id, documentId, 'PROCESSING', 'INDEXING');
      await this.persistVersion(job.actor_id, documentId, version.id, pageChunks);
      return { documentId, versionId: version.id, status: 'READY' };
    } catch (error) {
      const code = this.errorCode(error);
      await this.markProcessingFailure(job.actor_id, documentId, versionId, code).catch(() => undefined);
      throw error;
    }
  }

  private async purgeJob(job: IntelligenceJob): Promise<Record<string, unknown>> {
    const documentId = job.resource_id;
    if (!documentId || !UUID.test(documentId)) fail(404, 'RESOURCE_NOT_FOUND', 'O documento solicitado não está disponível.');
    const rows = await this.db.asActor(job.actor_id, (connection) =>
      connection.query<DocumentRow>(
        `SELECT id, workspace_id, material_id, owner_user_id, original_storage_key, original_name, mime_type,
                size_bytes, sha256, status, stage, error_code, active_version_id, deleted_at, created_at
         FROM documents WHERE id = $1 AND owner_user_id = $2`, [documentId, job.actor_id],
      ),
    );
    const document = rows[0];
    if (document && !document.deleted_at) fail(409, 'INVALID_STATE', 'A exclusão do documento ainda não foi solicitada.');
    if (document) {
      try {
        await this.storage.remove(document.original_storage_key);
      } catch {
        fail(503, 'STORAGE_OPERATION_FAILED', 'O arquivo não pôde ser removido; a exclusão será repetida.');
      }
      await this.db.asActor(job.actor_id, async (connection) => {
        await connection.query(`DELETE FROM documents WHERE id = $1 AND owner_user_id = $2 AND deleted_at IS NOT NULL`, [documentId, job.actor_id]);
      });
    }
    await this.releaseLifetimeQuota(job.actor_id, documentId);
    return { documentId, purged: true };
  }

  private async getOrCreateVersion(job: IntelligenceJob, documentId: string, fingerprint: string): Promise<{ id: string; status: string }> {
    return this.db.asActor(job.actor_id, async (connection) => {
      const current = await connection.query<{ id: string; status: string }>(
        `SELECT v.id, v.status FROM document_versions v
         JOIN documents d ON d.workspace_id = v.workspace_id AND d.id = v.document_id
         WHERE v.job_id = $1 AND v.document_id = $2 AND d.owner_user_id = $3`,
        [job.id, documentId, job.actor_id],
      );
      if (current[0]) return current[0];
      const docRows = await connection.query<DocumentRow>(
        `SELECT id, workspace_id, material_id, owner_user_id, original_storage_key, original_name, mime_type,
                size_bytes, sha256, status, stage, error_code, active_version_id, deleted_at, created_at
         FROM documents WHERE id = $1 AND owner_user_id = $2 AND deleted_at IS NULL FOR UPDATE`, [documentId, job.actor_id],
      );
      const document = docRows[0];
      if (!document) fail(404, 'RESOURCE_NOT_FOUND', 'O documento solicitado não está disponível.');
      const numbers = await connection.query<{ next_version: number }>(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM document_versions WHERE workspace_id = $1 AND document_id = $2`,
        [document.workspace_id, documentId],
      );
      const rows = await connection.query<{ id: string; status: string }>(
        `INSERT INTO document_versions (workspace_id, document_id, job_id, version, parser_version, chunker_version, embedding_fingerprint, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'PROCESSING') RETURNING id, status`,
        [document.workspace_id, documentId, job.id, numbers[0].next_version, DOCUMENT_PARSER_VERSION, DOCUMENT_CHUNKER_VERSION, fingerprint],
      );
      return rows[0];
    });
  }

  private async persistVersion(
    actorId: string,
    documentId: string,
    versionId: string,
    pages: Array<{ page: ParsedPage; chunks: Array<{ text: string; tokenCount: number; vector: number[]; hash: string }> }>,
  ): Promise<void> {
    await this.db.asActor(actorId, async (connection) => {
      const docRows = await connection.query<DocumentRow>(
        `SELECT id, workspace_id, material_id, owner_user_id, original_storage_key, original_name, mime_type,
                size_bytes, sha256, status, stage, error_code, active_version_id, deleted_at, created_at
         FROM documents WHERE id = $1 AND owner_user_id = $2 AND deleted_at IS NULL FOR UPDATE`, [documentId, actorId],
      );
      const document = docRows[0];
      if (!document) fail(404, 'RESOURCE_NOT_FOUND', 'O documento solicitado não está disponível.');
      const currentVersion = await connection.query<{ status: string }>(
        `SELECT status FROM document_versions WHERE workspace_id = $1 AND document_id = $2 AND id = $3 FOR UPDATE`,
        [document.workspace_id, documentId, versionId],
      );
      if (!currentVersion[0]) fail(404, 'RESOURCE_NOT_FOUND', 'A versão do documento não está disponível.');
      if (currentVersion[0].status === 'READY') return;

      const pageRows = await connection.query<{ page_number: number; id: string }>(
        `INSERT INTO document_pages (workspace_id, version_id, page_number, extracted_text, metadata)
         SELECT $1, $2, p.page_number, p.extracted_text, p.metadata
         FROM jsonb_to_recordset($3::jsonb) AS p(page_number integer, extracted_text text, metadata jsonb)
         RETURNING page_number, id`,
        [document.workspace_id, versionId, JSON.stringify(pages.map(({ page }) => ({ page_number: page.pageNumber, extracted_text: page.text, metadata: page.metadata })))],
      );
      const pageIds = new Map(pageRows.map((page) => [page.page_number, page.id]));
      const chunks = pages.flatMap(({ page, chunks: pageChunks }) => pageChunks.map((chunk, position) => ({
        page_id: pageIds.get(page.pageNumber), page_number: page.pageNumber, position, content: chunk.text,
        token_count: chunk.tokenCount, content_hash: chunk.hash, vector: chunk.vector,
      })));
      for (let offset = 0; offset < chunks.length; offset += 100) {
        const batch = chunks.slice(offset, offset + 100);
        const rows = await connection.query<{ id: string; page_id: string; position: number }>(
          `INSERT INTO document_chunks (workspace_id, version_id, page_id, position, content, token_count, content_hash)
           SELECT $1, $2, c.page_id, c.position, c.content, c.token_count, c.content_hash
           FROM jsonb_to_recordset($3::jsonb) AS c(page_id uuid, page_number integer, position integer, content text, token_count integer, content_hash text)
           RETURNING id, page_id, position`,
          [document.workspace_id, versionId, JSON.stringify(batch)],
        );
        const idByPagePosition = new Map(rows.map((row) => [`${row.page_id}:${row.position}`, row.id]));
        const embeddingRows = batch.map((chunk) => ({
          workspace_id: document.workspace_id,
          chunk_id: idByPagePosition.get(`${chunk.page_id}:${chunk.position}`),
          embedding_fingerprint: this.embeddings.fingerprint,
          embedding: chunk.vector,
        }));
        await connection.query(
          `INSERT INTO document_chunk_embeddings (workspace_id, chunk_id, embedding_fingerprint, embedding)
           SELECT e.workspace_id, e.chunk_id, e.embedding_fingerprint, e.embedding::vector
           FROM jsonb_to_recordset($1::jsonb) AS e(workspace_id uuid, chunk_id uuid, embedding_fingerprint text, embedding text)`,
          [JSON.stringify(embeddingRows.map((row) => ({ ...row, embedding: `[${row.embedding.join(',')}]` })))],
        );
      }
      await connection.query(`UPDATE document_versions SET status = 'READY' WHERE workspace_id = $1 AND id = $2`, [document.workspace_id, versionId]);
      await connection.query(
        `UPDATE documents SET active_version_id = $3, status = 'READY', stage = 'READY', error_code = NULL, updated_at = now()
         WHERE workspace_id = $1 AND id = $2 AND owner_user_id = $4 AND deleted_at IS NULL`,
        [document.workspace_id, documentId, versionId, actorId],
      );
    });
  }

  private async documentForProcessing(actorId: string, documentId: string): Promise<DocumentRow> {
    const rows = await this.db.asActor(actorId, (connection) =>
      connection.query<DocumentRow>(
        `SELECT d.id, d.workspace_id, d.material_id, d.owner_user_id, d.original_storage_key, d.original_name,
                d.mime_type, d.size_bytes, d.sha256, d.status, d.stage, d.error_code, d.active_version_id, d.deleted_at, d.created_at
         FROM documents d JOIN materials m ON m.workspace_id = d.workspace_id AND m.id = d.material_id
         JOIN courses c ON c.workspace_id = m.workspace_id AND c.id = m.course_id
         WHERE d.id = $1 AND d.owner_user_id = $2 AND m.owner_user_id = $2`, [documentId, actorId],
      ),
    );
    if (!rows[0]) fail(404, 'RESOURCE_NOT_FOUND', 'O documento solicitado não está disponível.');
    return rows[0];
  }

  private async authorizedMaterial(actorId: string, materialId: string): Promise<{ id: string; workspace_id: string; owner_user_id: string; classification: string }> {
    const rows = await this.db.asActor(actorId, (connection) =>
      connection.query<{ id: string; workspace_id: string; owner_user_id: string; classification: string }>(
        `SELECT m.id, m.workspace_id, m.owner_user_id, m.classification
         FROM materials m JOIN courses c ON c.workspace_id = m.workspace_id AND c.id = m.course_id
         WHERE m.id = $1 AND m.owner_user_id = $2 AND c.owner_user_id = $2 AND m.archived_at IS NULL AND c.archived_at IS NULL`,
        [materialId, actorId],
      ),
    );
    if (!rows[0]) fail(404, 'RESOURCE_NOT_FOUND', 'O material solicitado não está disponível.');
    return rows[0];
  }

  private async findUpload(actorId: string, key: string): Promise<UploadLookup | undefined> {
    return this.db.asActor(actorId, async (connection) => {
      const rows = await connection.query<DocumentRow>(
        `SELECT id, workspace_id, material_id, owner_user_id, original_storage_key, original_name, mime_type,
                size_bytes, sha256, status, stage, error_code, active_version_id, deleted_at, created_at
         FROM documents WHERE owner_user_id = $1 AND upload_idempotency_key = $2`, [actorId, key],
      );
      if (!rows[0]) return undefined;
      if (rows[0].deleted_at || rows[0].status === 'DELETING' || rows[0].status === 'DELETED') {
        fail(409, 'INVALID_STATE', 'Este arquivo está sendo excluído.');
      }
      const job = await this.jobForDocument(connection, actorId, rows[0].id, 'DOCUMENT_PROCESS');
      if (!job) fail(409, 'JOB_NOT_AVAILABLE', 'O arquivo foi recebido; solicite o status novamente.');
      return { document: this.view(rows[0]), job, materialId: rows[0].material_id, sha256: rows[0].sha256 };
    });
  }

  private async jobForDocument(connection: { query<T>(sql: string, params?: unknown[]): Promise<T[]> }, actorId: string, documentId: string, feature: string): Promise<JobView | undefined> {
    const rows = await connection.query<IntelligenceJob>(
      `SELECT id, workspace_id, actor_id, feature, state, stage, progress, resource_type, resource_id, payload, result, error_code, created_at
       FROM jobs WHERE actor_id = $1 AND feature = $2 AND resource_id = $3 ORDER BY created_at DESC LIMIT 1`,
      [actorId, feature, documentId],
    );
    return rows[0] ? toJobView(rows[0]) : undefined;
  }

  private async setDocumentStage(actorId: string, documentId: string, status: string, stage: string): Promise<void> {
    await this.db.asActor(actorId, async (connection) => {
      await connection.query(
        `UPDATE documents SET status = $3, stage = $4, updated_at = now()
         WHERE id = $1 AND owner_user_id = $2 AND deleted_at IS NULL`, [documentId, actorId, status, stage],
      );
    });
  }

  private async markProcessingFailure(actorId: string, documentId: string, versionId: string | undefined, code: string): Promise<void> {
    await this.db.asActor(actorId, async (connection) => {
      if (versionId) await connection.query(`UPDATE document_versions SET status = 'FAILED' WHERE id = $1`, [versionId]);
      await connection.query(
        `UPDATE documents SET status = CASE WHEN active_version_id IS NULL THEN 'FAILED' ELSE 'READY' END,
           stage = 'PROCESSING_FAILED', error_code = $3, updated_at = now()
         WHERE id = $1 AND owner_user_id = $2 AND deleted_at IS NULL`, [documentId, actorId, code],
      );
    });
  }

  private async chunkPage(text: string): Promise<string[]> {
    if (!text.trim()) return [];
    const sentences = text.split(/(?<=[.!?])(?=\s)|(?=\n)/).filter((part) => part.trim());
    const coarse: string[] = [];
    let current = '';
    for (const sentence of sentences) {
      const pieces = sentence.match(/.{1,1100}(?:\s+|$)/gs) ?? [sentence];
      for (const piece of pieces) {
        const separator = /^\s*\n/.test(piece) ? '\n' : ' ';
        const candidate = current ? `${current}${separator}${piece.trim()}` : piece.trim();
        if (current && candidate.length > 1_200) {
          coarse.push(current);
          current = `${current.slice(-160)}${separator}${piece.trim()}`;
        } else current = candidate;
      }
    }
    if (current.trim()) coarse.push(current.trim());
    const bounded: string[] = [];
    for (const chunk of coarse) await this.splitOversizedChunk(chunk, bounded, 0);
    return bounded;
  }

  private async splitOversizedChunk(text: string, output: string[], depth: number): Promise<void> {
    if (depth > 12) fail(413, 'DOCUMENT_CHUNK_LIMIT', 'Não foi possível dividir um trecho do documento.');
    const tokenCount = await this.embeddings.countTokens(text);
    if (tokenCount <= 480) {
      output.push(text);
      return;
    }
    const middle = Math.floor(text.length / 2);
    let split = text.lastIndexOf(' ', middle);
    if (split < text.length * 0.25) split = text.indexOf(' ', middle);
    if (split <= 0 || split >= text.length - 1) fail(413, 'DOCUMENT_CHUNK_LIMIT', 'Um trecho excede o limite do modelo de embeddings.');
    const left = text.slice(0, split).trim();
    const right = text.slice(Math.max(0, split - 160)).trim();
    await this.splitOversizedChunk(left, output, depth + 1);
    await this.splitOversizedChunk(right, output, depth + 1);
  }

  private async reserveUploadQuota(actorId: string, documentId: string, sizeBytes: number): Promise<void> {
    const reservations: Array<[string, number]> = [
      [STORAGE_METRIC, sizeBytes],
      [LIFETIME_STORAGE_METRIC, sizeBytes],
      [DOCUMENT_COUNT_METRIC, 1],
    ];
    const reserved: string[] = [];
    try {
      for (const [metric, amount] of reservations) {
        await this.quota.reserve(actorId, metric, documentId, amount);
        reserved.push(metric);
      }
    } catch (error) {
      await Promise.all(reserved.map((metric) => this.quota.release(actorId, metric, documentId).catch(() => undefined)));
      throw error;
    }
  }

  private async commitUploadQuota(actorId: string, documentId: string): Promise<void> {
    await Promise.all([
      this.quota.commit(actorId, STORAGE_METRIC, documentId),
      this.quota.commit(actorId, LIFETIME_STORAGE_METRIC, documentId),
      this.quota.commit(actorId, DOCUMENT_COUNT_METRIC, documentId),
    ]);
  }

  private async releaseUploadQuota(actorId: string, documentId: string): Promise<void> {
    await Promise.all([
      this.quota.release(actorId, STORAGE_METRIC, documentId),
      this.quota.release(actorId, LIFETIME_STORAGE_METRIC, documentId),
      this.quota.release(actorId, DOCUMENT_COUNT_METRIC, documentId),
    ]);
  }

  private async releaseLifetimeQuota(actorId: string, documentId: string): Promise<void> {
    await Promise.all([
      this.quota.releaseCommitted(actorId, LIFETIME_STORAGE_METRIC, documentId),
      this.quota.releaseCommitted(actorId, DOCUMENT_COUNT_METRIC, documentId),
    ]);
  }

  private async removeUnregisteredFile(storageKey: string): Promise<boolean> {
    try {
      await this.storage.remove(storageKey);
      return true;
    } catch {
      return false;
    }
  }

  private view(row: DocumentRow): DocumentView {
    return {
      id: row.id,
      materialId: row.material_id,
      courseId: row.course_id ?? null,
      name: row.original_name,
      sizeBytes: String(row.size_bytes),
      format: row.mime_type === 'application/pdf' ? 'PDF' : 'PPTX',
      status: row.status,
      stage: row.stage,
      errorCode: row.error_code,
      activeVersionId: row.active_version_id,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  private safeFileName(value: string): string {
    const safe = Array.from(value).map((character) => {
      const code = character.charCodeAt(0);
      return character === '/' || character === '\\' || code <= 0x1f || code === 0x7f ? '_' : character;
    }).join('').trim().slice(0, 255);
    return safe || 'documento';
  }

  private offsetFromCursor(cursor?: string): number {
    if (!cursor) return 0;
    try {
      const value = Number(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (!Number.isSafeInteger(value) || value < 0) throw new Error('bad cursor');
      return value;
    } catch {
      fail(400, 'VALIDATION_FAILED', 'Cursor inválido.');
    }
  }

  private errorCode(error: unknown): string {
    if (error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string') {
      return (error as { code: string }).code;
    }
    return 'DOCUMENT_PARSE_FAILED';
  }

  private assertUuid(value: string): void {
    if (!UUID.test(value)) fail(400, 'VALIDATION_FAILED', 'Identificador inválido.');
  }
}
