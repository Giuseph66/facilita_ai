import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseService, QueryConnection } from '../../core/database.service';
import { QuotaService } from '../../core/quota.service';
import { RateLimitService } from '../../core/rate-limit.service';
import { fail } from '../../core/errors';
import { DocumentsService } from '../documents/documents.service';
import {
  ClassInput,
  CourseInput,
  CoursePatch,
  InvitationInput,
  MaterialInput,
} from './academic.dto';

type Cursor = { id: string; createdAt: string };
type CourseRow = {
  id: string;
  workspace_id: string;
  owner_user_id: string;
  title: string;
  description: string;
  objectives: string[];
  revision: number;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
};
type TopicRow = { id: string; title: string; position: number };
type ClassView = {
  id: string;
  workspaceId: string;
  courseId: string;
  teacherUserId: string;
  name: string;
  period: string;
  studentCount: number | null;
  archivedAt: string | null;
  createdAt: string;
};
type ClassMemberView = { userId: string; name: string; role: 'STUDENT'; status: string; joinedAt: string };

@Injectable()
export class AcademicService {
  constructor(
    private readonly db: DatabaseService,
    private readonly quota: QuotaService,
    private readonly rateLimit: RateLimitService,
    private readonly documents: DocumentsService,
  ) {}

  async workspaces(userId: string, cursorValue?: string): Promise<{ items: Array<{ id: string; name: string; type: 'PERSONAL' | 'INSTITUTION'; roles: string[] }>; nextCursor: string | null }> {
    const cursor = this.decodeIdCursor(cursorValue);
    return this.db.asActor(userId, async (connection) => {
      const rows = await connection.query<{ id: string; name: string; type: 'PERSONAL' | 'INSTITUTION'; roles: string[] }>(
        `SELECT w.id, w.name, w.type, COALESCE(array_agg(r.role ORDER BY r.role) FILTER (WHERE r.role IS NOT NULL), ARRAY[]::text[]) AS roles
         FROM workspace_memberships m JOIN workspaces w ON w.id = m.workspace_id
         LEFT JOIN workspace_roles r ON r.workspace_id = w.id AND r.user_id = m.user_id
         WHERE m.user_id = $1 AND m.status = 'ACTIVE' AND ($2::uuid IS NULL OR w.id > $2::uuid)
         GROUP BY w.id, w.name, w.type ORDER BY w.id LIMIT 21`,
        [userId, cursor],
      );
      const hasMore = rows.length > 20;
      const items = rows.slice(0, 20);
      return { items, nextCursor: hasMore ? this.encodeIdCursor(items[items.length - 1].id) : null };
    });
  }

  async listCourses(userId: string, workspaceId: string, cursorValue?: string) {
    const cursor = this.decodeCursor(cursorValue);
    return this.db.asActor(userId, async (connection) => {
      const membership = await connection.query<{ id: string }>(
        `SELECT w.id FROM workspaces w JOIN workspace_memberships m ON m.workspace_id = w.id
         WHERE w.id = $1 AND m.user_id = $2 AND m.status = 'ACTIVE'`, [workspaceId, userId],
      );
      if (!membership[0]) fail(404, 'RESOURCE_NOT_FOUND', 'Espaço não encontrado.');
      const rows = await connection.query<CourseRow>(
        `SELECT c.id, c.workspace_id, c.owner_user_id, c.title, c.description, c.objectives,
                c.revision, c.archived_at, c.created_at, c.updated_at
         FROM courses c
         WHERE c.workspace_id = $1 AND c.archived_at IS NULL
           AND ($2::timestamptz IS NULL OR (c.created_at, c.id) > ($2::timestamptz, $3::uuid))
         ORDER BY c.created_at, c.id LIMIT 21`,
        [workspaceId, cursor?.createdAt ?? null, cursor?.id ?? null],
      );
      const hasMore = rows.length > 20;
      const page = rows.slice(0, 20);
      const views = await this.courseViews(connection, page);
      const last = page[page.length - 1];
      return { items: views, nextCursor: hasMore && last ? this.encodeCursor(last) : null };
    });
  }

  async createCourse(userId: string, workspaceId: string, input: CourseInput, requestId?: string) {
    const id = randomUUID();
    const view = await this.db.asActor(userId, async (connection) => {
      const workspace = await connection.query<{ type: string; owner_user_id: string | null }>(
        `SELECT w.type, w.owner_user_id FROM workspaces w
         JOIN workspace_memberships m ON m.workspace_id = w.id
         WHERE w.id = $1 AND m.user_id = $2 AND m.status = 'ACTIVE'`, [workspaceId, userId],
      );
      if (!workspace[0]) fail(404, 'RESOURCE_NOT_FOUND', 'Espaço não encontrado.');
      if (workspace[0].type !== 'PERSONAL' || workspace[0].owner_user_id !== userId) {
        const teacher = await connection.query<{ role: string }>(
          `SELECT role FROM workspace_roles WHERE workspace_id = $1 AND user_id = $2 AND role = 'TEACHER'`, [workspaceId, userId],
        );
        if (!teacher[0]) fail(403, 'FORBIDDEN', 'É necessário ter papel de professor neste espaço.');
      }
      const rows = await connection.query<CourseRow>(
        `INSERT INTO courses (id, workspace_id, owner_user_id, title, description, objectives)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         RETURNING id, workspace_id, owner_user_id, title, description, objectives, revision, archived_at, created_at, updated_at`,
        [id, workspaceId, userId, input.title, input.description, JSON.stringify(input.objectives)],
      );
      await this.writeTopics(connection, workspaceId, id, input.topics);
      await connection.query(
        `INSERT INTO audit_events (actor_id, action, resource_type, resource_id, workspace_id, request_id)
         VALUES ($1, 'COURSE_CREATED', 'course', $2, $3, $4)`,
        [userId, id, workspaceId, requestId ?? null],
      );
      return this.courseView(connection, rows[0]);
    });
    return view;
  }

  async getCourse(userId: string, courseId: string) {
    return this.db.asActor(userId, async (connection) => {
      const rows = await connection.query<CourseRow>(
        `SELECT id, workspace_id, owner_user_id, title, description, objectives, revision, archived_at, created_at, updated_at
         FROM courses WHERE id = $1`, [courseId],
      );
      if (!rows[0]) fail(404, 'RESOURCE_NOT_FOUND', 'Disciplina não encontrada.');
      return this.courseView(connection, rows[0]);
    });
  }

  async patchCourse(userId: string, courseId: string, patch: CoursePatch, requestId?: string) {
    return this.db.asActor(userId, async (connection) => {
      const current = await connection.query<CourseRow>(
        `SELECT id, workspace_id, owner_user_id, title, description, objectives, revision, archived_at, created_at, updated_at
         FROM courses WHERE id = $1 AND owner_user_id = $2 FOR UPDATE`, [courseId, userId],
      );
      if (!current[0]) fail(404, 'RESOURCE_NOT_FOUND', 'Disciplina não encontrada.');
      if (Number(current[0].revision) !== patch.revision) {
        fail(409, 'REVISION_CONFLICT', 'A disciplina mudou desde a última leitura.', { currentRevision: current[0].revision });
      }
      const rows = await connection.query<CourseRow>(
        `UPDATE courses SET title = COALESCE($3, title), description = COALESCE($4, description),
             objectives = COALESCE($5::jsonb, objectives), archived_at = $6, revision = revision + 1, updated_at = now()
         WHERE id = $1 AND owner_user_id = $2 AND revision = $7
         RETURNING id, workspace_id, owner_user_id, title, description, objectives, revision, archived_at, created_at, updated_at`,
        [courseId, userId, patch.title ?? null, patch.description ?? null,
          patch.objectives === undefined ? null : JSON.stringify(patch.objectives),
          patch.archived === undefined ? current[0].archived_at : patch.archived ? new Date() : null,
          patch.revision],
      );
      if (!rows[0]) fail(409, 'REVISION_CONFLICT', 'A disciplina mudou desde a última leitura.');
      if (patch.topics !== undefined) await this.writeTopics(connection, rows[0].workspace_id, courseId, patch.topics);
      if (patch.archived === true) {
        const classes = await connection.query<{ id: string }>(
          `UPDATE classes SET archived_at = COALESCE(archived_at, now()), updated_at = now()
           WHERE workspace_id = $1 AND course_id = $2 AND archived_at IS NULL RETURNING id`,
          [rows[0].workspace_id, courseId],
        );
        await connection.query(
          `UPDATE material_class_releases SET revoked_at = COALESCE(revoked_at, now())
           WHERE workspace_id = $1 AND class_id = ANY($2::uuid[]) AND revoked_at IS NULL`,
          [rows[0].workspace_id, classes.map((row) => row.id)],
        );
      }
      await connection.query(
        `INSERT INTO audit_events (actor_id, action, resource_type, resource_id, workspace_id, request_id, metadata)
         VALUES ($1, $2, 'course', $3, $4, $5, jsonb_build_object('revision', $6::integer))`,
        [userId, patch.archived === true ? 'COURSE_ARCHIVED' : patch.archived === false ? 'COURSE_RESTORED' : 'COURSE_UPDATED', courseId,
          rows[0].workspace_id, requestId ?? null, rows[0].revision],
      );
      return this.courseView(connection, rows[0]);
    });
  }

  async createClass(userId: string, courseId: string, input: ClassInput, requestId?: string) {
    const classId = randomUUID();
    await this.quota.reserve(userId, 'MAX_CLASSES', classId, 1);
    try {
      const created = await this.db.asActor(userId, async (connection) => {
        const courses = await connection.query<{ workspace_id: string; owner_user_id: string }>(
          `SELECT workspace_id, owner_user_id FROM courses WHERE id = $1`, [courseId],
        );
        if (!courses[0] || courses[0].owner_user_id !== userId) fail(404, 'RESOURCE_NOT_FOUND', 'Disciplina não encontrada.');
        const teacher = await connection.query<{ role: string }>(
          `SELECT role FROM workspace_roles WHERE workspace_id = $1 AND user_id = $2 AND role = 'TEACHER'`,
          [courses[0].workspace_id, userId],
        );
        if (!teacher[0]) fail(403, 'FORBIDDEN', 'É necessário ter papel de professor para criar uma turma.');
        const rows = await connection.query<{ id: string; workspace_id: string; course_id: string; teacher_user_id: string; name: string; period: string; created_at: Date; archived_at: Date | null }>(
          `INSERT INTO classes (id, workspace_id, course_id, teacher_user_id, name, period)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, workspace_id, course_id, teacher_user_id, name, period, created_at, archived_at`,
          [classId, courses[0].workspace_id, courseId, userId, input.name, input.period],
        );
        await connection.query(
          `INSERT INTO audit_events (actor_id, action, resource_type, resource_id, workspace_id, request_id)
           VALUES ($1, 'CLASS_CREATED', 'class', $2, $3, $4)`, [userId, classId, courses[0].workspace_id, requestId ?? null],
        );
        return rows[0];
      });
      const view = await this.classView(userId, created);
      await this.quota.commit(userId, 'MAX_CLASSES', classId);
      return view;
    } catch (error) {
      await this.db.asActor(userId, (connection) => connection.query(
        `DELETE FROM classes WHERE id = $1 AND teacher_user_id = $2`, [classId, userId],
      )).catch(() => undefined);
      await this.quota.releaseCommitted(userId, 'MAX_CLASSES', classId).catch(() => undefined);
      throw error;
    }
  }

  async listClasses(userId: string, cursorValue?: string) {
    const cursor = this.decodeCursor(cursorValue);
    return this.db.asActor(userId, async (connection) => {
      const rows = await connection.query<{
        id: string; workspace_id: string; course_id: string; teacher_user_id: string; name: string; period: string; created_at: Date; archived_at: Date | null;
      }>(
        `SELECT c.id, c.workspace_id, c.course_id, c.teacher_user_id, c.name, c.period, c.created_at, c.archived_at
         FROM classes c JOIN courses co ON co.workspace_id = c.workspace_id AND co.id = c.course_id
         WHERE c.archived_at IS NULL AND co.archived_at IS NULL
           AND (c.teacher_user_id = $1 OR EXISTS (
             SELECT 1 FROM enrollments e WHERE e.workspace_id = c.workspace_id AND e.class_id = c.id AND e.user_id = $1 AND e.status = 'ACTIVE'
           ))
           AND ($2::timestamptz IS NULL OR (c.created_at, c.id) > ($2::timestamptz, $3::uuid))
         ORDER BY c.created_at, c.id LIMIT 21`,
        [userId, cursor?.createdAt ?? null, cursor?.id ?? null],
      );
      const hasMore = rows.length > 20;
      const page = rows.slice(0, 20);
      const items = await Promise.all(page.map((row) => this.classView(userId, row, connection)));
      const last = page[page.length - 1];
      return { items, nextCursor: hasMore && last ? this.encodeCursor(last) : null };
    });
  }

  async listCourseClasses(userId: string, courseId: string, cursorValue?: string) {
    const cursor = this.decodeCursor(cursorValue);
    return this.db.asActor(userId, async (connection) => {
      const courses = await connection.query<{ id: string }>(`SELECT id FROM courses WHERE id = $1`, [courseId]);
      if (!courses[0]) fail(404, 'RESOURCE_NOT_FOUND', 'Disciplina não encontrada.');
      const rows = await connection.query<{
        id: string; workspace_id: string; course_id: string; teacher_user_id: string; name: string; period: string; created_at: Date; archived_at: Date | null;
      }>(
        `SELECT c.id, c.workspace_id, c.course_id, c.teacher_user_id, c.name, c.period, c.created_at, c.archived_at
         FROM classes c WHERE c.course_id = $1 AND c.archived_at IS NULL
           AND (c.teacher_user_id = $2 OR EXISTS (
             SELECT 1 FROM enrollments e WHERE e.workspace_id = c.workspace_id AND e.class_id = c.id AND e.user_id = $2 AND e.status = 'ACTIVE'
           ))
           AND ($3::timestamptz IS NULL OR (c.created_at, c.id) > ($3::timestamptz, $4::uuid))
         ORDER BY c.created_at, c.id LIMIT 21`,
        [courseId, userId, cursor?.createdAt ?? null, cursor?.id ?? null],
      );
      const hasMore = rows.length > 20;
      const page = rows.slice(0, 20);
      const items = await Promise.all(page.map((row) => this.classView(userId, row, connection)));
      const last = page[page.length - 1];
      return { items, nextCursor: hasMore && last ? this.encodeCursor(last) : null };
    });
  }

  async getClass(userId: string, classId: string) {
    return this.db.asActor(userId, async (connection) => {
      const rows = await connection.query<{
        id: string; workspace_id: string; course_id: string; teacher_user_id: string; name: string; period: string; created_at: Date; archived_at: Date | null;
      }>(
        `SELECT c.id, c.workspace_id, c.course_id, c.teacher_user_id, c.name, c.period, c.created_at, c.archived_at
         FROM classes c WHERE c.id = $1`, [classId],
      );
      if (!rows[0]) fail(404, 'RESOURCE_NOT_FOUND', 'Turma não encontrada.');
      const view = await this.classView(userId, rows[0], connection);
      const members = await connection.query<{ user_id: string; name: string; role: 'STUDENT'; status: string; joined_at: Date }>(
        `SELECT e.user_id, u.name, e.role, e.status, e.joined_at
         FROM enrollments e JOIN users u ON u.id = e.user_id
         WHERE e.workspace_id = $1 AND e.class_id = $2
           AND e.role = 'STUDENT'
           AND ($3::uuid = $4::uuid OR e.user_id = $3::uuid)
         ORDER BY e.joined_at, e.user_id`,
        [rows[0].workspace_id, classId, userId, rows[0].teacher_user_id],
      );
      return {
        ...view,
        members: members.map((member): ClassMemberView => ({
          userId: member.user_id,
          name: member.name,
          role: member.role,
          status: member.status,
          joinedAt: new Date(member.joined_at).toISOString(),
        })),
      };
    });
  }

  async patchClass(userId: string, classId: string, patch: { name?: string; period?: string; archived?: boolean }, requestId?: string) {
    return this.db.asActor(userId, async (connection) => {
      const current = await connection.query<{ id: string; workspace_id: string; course_id: string; archived_at: Date | null }>(
        `SELECT id, workspace_id, course_id, archived_at FROM classes WHERE id = $1 AND teacher_user_id = $2 FOR UPDATE`, [classId, userId],
      );
      if (!current[0]) fail(404, 'RESOURCE_NOT_FOUND', 'Turma não encontrada.');
      const archivedAt = patch.archived === undefined ? current[0].archived_at : patch.archived ? new Date() : null;
      const rows = await connection.query<{
        id: string; workspace_id: string; course_id: string; teacher_user_id: string; name: string; period: string; created_at: Date; archived_at: Date | null;
      }>(
        `UPDATE classes SET name = COALESCE($3, name), period = COALESCE($4, period), archived_at = $5, updated_at = now()
         WHERE id = $1 AND teacher_user_id = $2
         RETURNING id, workspace_id, course_id, teacher_user_id, name, period, created_at, archived_at`,
        [classId, userId, patch.name ?? null, patch.period ?? null, archivedAt],
      );
      if (patch.archived === true) {
        await connection.query(
          `UPDATE material_class_releases SET revoked_at = COALESCE(revoked_at, now())
           WHERE workspace_id = $1 AND class_id = $2 AND revoked_at IS NULL`, [current[0].workspace_id, classId],
        );
      }
      await connection.query(
        `INSERT INTO audit_events (actor_id, action, resource_type, resource_id, workspace_id, request_id)
         VALUES ($1, $2, 'class', $3, $4, $5)`,
        [userId, patch.archived === true ? 'CLASS_ARCHIVED' : patch.archived === false ? 'CLASS_RESTORED' : 'CLASS_UPDATED', classId, current[0].workspace_id, requestId ?? null],
      );
      return this.classView(userId, rows[0], connection);
    });
  }

  async createInvitation(userId: string, classId: string, input: InvitationInput, ip: string, requestId?: string) {
    await this.rateLimit.enforce('class-invite.create.ip', ip, 20, 3600);
    await this.rateLimit.enforce('class-invite.create.user', userId, 40, 3600);
    const code = randomBytes(32).toString('base64url');
    const tokenHash = this.sha256(code);
    return this.db.asActor(userId, async (connection) => {
      const classes = await connection.query<{ workspace_id: string; archived_at: Date | null }>(
        `SELECT workspace_id, archived_at FROM classes WHERE id = $1 AND teacher_user_id = $2`, [classId, userId],
      );
      if (!classes[0] || classes[0].archived_at) fail(404, 'RESOURCE_NOT_FOUND', 'Turma não encontrada.');
      const rows = await connection.query<{ id: string; expires_at: Date }>(
        `INSERT INTO class_invitations (workspace_id, class_id, token_hash, expires_at, max_uses)
         VALUES ($1, $2, $3, now() + ($4 * interval '1 hour'), $5) RETURNING id, expires_at`,
        [classes[0].workspace_id, classId, tokenHash, input.expiresInHours, input.maxUses],
      );
      await connection.query(
        `INSERT INTO audit_events (actor_id, action, resource_type, resource_id, workspace_id, request_id, metadata)
         VALUES ($1, 'CLASS_INVITATION_CREATED', 'class', $2, $3, $4, jsonb_build_object('maxUses', $5::integer))`,
        [userId, classId, classes[0].workspace_id, requestId ?? null, input.maxUses],
      );
      return { id: rows[0].id, classId, inviteCode: code, expiresAt: new Date(rows[0].expires_at).toISOString(), maxUses: input.maxUses, usedCount: 0 };
    });
  }

  async enroll(userId: string, code: string, ip: string, requestId?: string) {
    await this.rateLimit.enforce('class-invite.redeem.ip', ip, 20, 3600);
    await this.rateLimit.enforce('class-invite.redeem.user', userId, 20, 3600);
    const tokenHash = this.sha256(code);
    return this.db.asActor(userId, async (connection) => {
      const invitations = await connection.query<{ workspace_id: string; class_id: string; user_id: string; role: string; status: string; joined_at: Date }>(
        `SELECT workspace_id, class_id, user_id, role, status, joined_at FROM redeem_class_invitation($1)`, [tokenHash],
      );
      const invitation = invitations[0];
      if (!invitation) fail(400, 'INVITATION_INVALID', 'O convite expirou, foi revogado ou atingiu o limite de usos.');
      await connection.query(
        `INSERT INTO audit_events (actor_id, action, resource_type, resource_id, workspace_id, request_id)
         VALUES ($1, 'ENROLLMENT_CREATED', 'class', $2, $3, $4)`,
        [userId, invitation.class_id, invitation.workspace_id, requestId ?? null],
      );
      return {
        workspaceId: invitation.workspace_id,
        classId: invitation.class_id,
        userId: invitation.user_id,
        role: 'STUDENT' as const,
        status: 'ACTIVE' as const,
        joinedAt: new Date(invitation.joined_at).toISOString(),
      };
    });
  }

  async leaveOrRevoke(userId: string, classId: string, targetUserId: string, requestId?: string): Promise<void> {
    await this.db.asActor(userId, async (connection) => {
      const classes = await connection.query<{ workspace_id: string; teacher_user_id: string }>(
        `SELECT workspace_id, teacher_user_id FROM classes WHERE id = $1`, [classId],
      );
      if (!classes[0]) fail(404, 'RESOURCE_NOT_FOUND', 'Turma ou matrícula não encontrada.');
      const teacher = classes[0].teacher_user_id === userId;
      if (!teacher && (targetUserId !== userId)) fail(404, 'RESOURCE_NOT_FOUND', 'Turma ou matrícula não encontrada.');
      const status = teacher ? 'REVOKED' : 'LEFT';
      const rows = await connection.query<{ user_id: string }>(
        `UPDATE enrollments SET status = $4, updated_at = now()
         WHERE workspace_id = $1 AND class_id = $2 AND user_id = $3 AND status = 'ACTIVE'
         RETURNING user_id`,
        [classes[0].workspace_id, classId, targetUserId, status],
      );
      if (!rows[0]) fail(404, 'RESOURCE_NOT_FOUND', 'Turma ou matrícula não encontrada.');
      await connection.query(`SELECT bump_workspace_acl($1)`, [classes[0].workspace_id]);
      await connection.query(
        `INSERT INTO audit_events (actor_id, action, resource_type, resource_id, workspace_id, request_id, metadata)
         VALUES ($1, $2, 'class', $3, $4, $5, jsonb_build_object('userId', $6::uuid))`,
        [userId, teacher ? 'ENROLLMENT_REVOKED' : 'ENROLLMENT_LEFT', classId, classes[0].workspace_id, requestId ?? null, targetUserId],
      );
    });
  }

  async listMaterials(userId: string, courseId: string, cursorValue?: string) {
    const cursor = this.decodeCursor(cursorValue);
    return this.db.asActor(userId, async (connection) => {
      const courses = await connection.query<{ id: string }>(`SELECT id FROM courses WHERE id = $1`, [courseId]);
      if (!courses[0]) fail(404, 'RESOURCE_NOT_FOUND', 'Disciplina não encontrada.');
      const rows = await connection.query<{
        id: string; workspace_id: string; course_id: string; owner_user_id: string; title: string; kind: string; classification: string;
        revision: number; archived_at: Date | null; created_at: Date; updated_at: Date;
      }>(
        `SELECT m.id, m.workspace_id, m.course_id, m.owner_user_id, m.title, m.kind, m.classification,
                m.revision, m.archived_at, m.created_at, m.updated_at
         FROM materials m WHERE m.course_id = $1 AND m.archived_at IS NULL
           AND ($2::timestamptz IS NULL OR (m.created_at, m.id) > ($2::timestamptz, $3::uuid))
         ORDER BY m.created_at, m.id LIMIT 21`,
        [courseId, cursor?.createdAt ?? null, cursor?.id ?? null],
      );
      const hasMore = rows.length > 20;
      const page = rows.slice(0, 20);
      const items = await Promise.all(page.map(async (row) => {
        const view = await this.materialView(connection, userId, row);
        const documents = await this.documents.listForMaterial(userId, row.id);
        return { ...view, documents: documents.items, documentsNextCursor: documents.nextCursor };
      }));
      const last = page[page.length - 1];
      return { items, nextCursor: hasMore && last ? this.encodeCursor(last) : null };
    });
  }

  async createMaterial(userId: string, courseId: string, input: MaterialInput, requestId?: string) {
    await this.quota.require(userId, 'MATERIALS_CREATE');
    return this.db.asActor(userId, async (connection) => {
      const courses = await connection.query<{ workspace_id: string; owner_user_id: string }>(
        `SELECT workspace_id, owner_user_id FROM courses WHERE id = $1`, [courseId],
      );
      if (!courses[0] || courses[0].owner_user_id !== userId) fail(404, 'RESOURCE_NOT_FOUND', 'Disciplina não encontrada.');
      if (input.classification === 'TEACHER_SECRET') {
        const roles = await connection.query<{ role: string }>(
          `SELECT role FROM workspace_roles WHERE workspace_id = $1 AND user_id = $2 AND role = 'TEACHER'`,
          [courses[0].workspace_id, userId],
        );
        if (!roles[0]) fail(403, 'FORBIDDEN', 'Somente professores podem criar material reservado.');
      }
      const rows = await connection.query<{
        id: string; workspace_id: string; course_id: string; owner_user_id: string; title: string; kind: string; classification: string;
        revision: number; archived_at: Date | null; created_at: Date; updated_at: Date;
      }>(
        `INSERT INTO materials (workspace_id, course_id, owner_user_id, title, kind, classification)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, workspace_id, course_id, owner_user_id, title, kind, classification, revision, archived_at, created_at, updated_at`,
        [courses[0].workspace_id, courseId, userId, input.title, input.kind, input.classification],
      );
      await connection.query(
        `INSERT INTO audit_events (actor_id, action, resource_type, resource_id, workspace_id, request_id, metadata)
         VALUES ($1, 'MATERIAL_CREATED', 'material', $2, $3, $4, jsonb_build_object('classification', $5::text))`,
        [userId, rows[0].id, courses[0].workspace_id, requestId ?? null, input.classification],
      );
      return this.materialView(connection, userId, rows[0]);
    });
  }

  async releaseMaterial(userId: string, materialId: string, classId: string, revision: number, requestId?: string) {
    return this.db.asActor(userId, async (connection) => {
      const materials = await connection.query<{
        id: string; workspace_id: string; course_id: string; owner_user_id: string; classification: string; revision: number;
      }>(
        `SELECT id, workspace_id, course_id, owner_user_id, classification, revision
         FROM materials WHERE id = $1 AND owner_user_id = $2 FOR UPDATE`, [materialId, userId],
      );
      const material = materials[0];
      if (!material) fail(404, 'RESOURCE_NOT_FOUND', 'Material não encontrado.');
      if (material.classification === 'TEACHER_SECRET') fail(409, 'SECRET_MATERIAL_CANNOT_BE_SHARED', 'Este material é reservado ao professor.');
      if (Number(material.revision) !== revision) fail(409, 'REVISION_CONFLICT', 'O material mudou desde a última leitura.', { currentRevision: material.revision });
      const classes = await connection.query<{ id: string }>(
        `SELECT id FROM classes WHERE id = $1 AND workspace_id = $2 AND course_id = $3
           AND teacher_user_id = $4 AND archived_at IS NULL`,
        [classId, material.workspace_id, material.course_id, userId],
      );
      if (!classes[0]) fail(404, 'RESOURCE_NOT_FOUND', 'Turma não encontrada.');
      const rows = await connection.query<{ released_at: Date }>(
        `INSERT INTO material_class_releases (workspace_id, material_id, class_id, released_at, revoked_at)
         VALUES ($1, $2, $3, now(), NULL)
         ON CONFLICT (material_id, class_id) DO UPDATE SET released_at = now(), revoked_at = NULL
         RETURNING released_at`, [material.workspace_id, materialId, classId],
      );
      const revisionRows = await connection.query<{ revision: number }>(
        `UPDATE materials SET revision = revision + 1, updated_at = now() WHERE id = $1 RETURNING revision`, [materialId],
      );
      await connection.query(`SELECT bump_workspace_acl($1)`, [material.workspace_id]);
      await connection.query(
        `INSERT INTO audit_events (actor_id, action, resource_type, resource_id, workspace_id, request_id, metadata)
         VALUES ($1, 'MATERIAL_RELEASED', 'material', $2, $3, $4, jsonb_build_object('classId', $5::uuid))`,
        [userId, materialId, material.workspace_id, requestId ?? null, classId],
      );
      return { materialId, classId, revision: Number(revisionRows[0].revision), releasedAt: new Date(rows[0].released_at).toISOString(), revokedAt: null };
    });
  }

  async revokeMaterial(userId: string, materialId: string, classId: string, requestId?: string): Promise<void> {
    await this.db.asActor(userId, async (connection) => {
      const materials = await connection.query<{ workspace_id: string }>(
        `SELECT workspace_id FROM materials WHERE id = $1 AND owner_user_id = $2`, [materialId, userId],
      );
      if (!materials[0]) fail(404, 'RESOURCE_NOT_FOUND', 'Liberação não encontrada.');
      const rows = await connection.query<{ revoked_at: Date }>(
        `UPDATE material_class_releases SET revoked_at = COALESCE(revoked_at, now())
         WHERE workspace_id = $1 AND material_id = $2 AND class_id = $3 AND revoked_at IS NULL
         RETURNING revoked_at`, [materials[0].workspace_id, materialId, classId],
      );
      if (!rows[0]) {
        const existing = await connection.query<{ id: string }>(
          `SELECT material_id AS id FROM material_class_releases WHERE workspace_id = $1 AND material_id = $2 AND class_id = $3`,
          [materials[0].workspace_id, materialId, classId],
        );
        if (existing[0]) return;
        fail(404, 'RESOURCE_NOT_FOUND', 'Liberação não encontrada.');
      }
      await connection.query(
        `UPDATE materials SET revision = revision + 1, updated_at = now() WHERE id = $1`, [materialId],
      );
      await connection.query(`SELECT bump_workspace_acl($1)`, [materials[0].workspace_id]);
      await connection.query(
        `INSERT INTO audit_events (actor_id, action, resource_type, resource_id, workspace_id, request_id, metadata)
         VALUES ($1, 'MATERIAL_RELEASE_REVOKED', 'material', $2, $3, $4, jsonb_build_object('classId', $5::uuid))`,
        [userId, materialId, materials[0].workspace_id, requestId ?? null, classId],
      );
    });
  }

  private async courseViews(connection: QueryConnection, rows: CourseRow[]) {
    if (!rows.length) return [];
    const topics = await connection.query<TopicRow & { course_id: string }>(
      `SELECT id, course_id, title, position FROM course_topics
       WHERE course_id = ANY($1::uuid[]) AND publication_status <> 'ARCHIVED'
       ORDER BY course_id, position`, [rows.map((row) => row.id)],
    );
    const grouped = new Map<string, TopicRow[]>();
    for (const topic of topics) {
      const group = grouped.get(topic.course_id) ?? [];
      group.push({ id: topic.id, title: topic.title, position: Number(topic.position) });
      grouped.set(topic.course_id, group);
    }
    return rows.map((row) => this.courseDto(row, grouped.get(row.id) ?? []));
  }

  private async courseView(connection: QueryConnection, row: CourseRow) {
    const topics = await connection.query<TopicRow>(
      `SELECT id, title, position FROM course_topics
       WHERE workspace_id = $1 AND course_id = $2 AND publication_status <> 'ARCHIVED'
       ORDER BY position`, [row.workspace_id, row.id],
    );
    return this.courseDto(row, topics.map((topic) => ({ ...topic, position: Number(topic.position) })));
  }

  private courseDto(row: CourseRow, topics: TopicRow[]) {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      ownerUserId: row.owner_user_id,
      title: row.title,
      description: row.description,
      revision: Number(row.revision),
      topics: topics.map((topic) => topic.title),
      topicItems: topics.map((topic) => ({ id: topic.id, title: topic.title, position: topic.position })),
      objectives: Array.isArray(row.objectives) ? row.objectives : [],
      archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private async writeTopics(connection: QueryConnection, workspaceId: string, courseId: string, titles: string[]): Promise<void> {
    const existing = await connection.query<TopicRow>(
      `SELECT id, title, position FROM course_topics WHERE workspace_id = $1 AND course_id = $2
       AND publication_status <> 'ARCHIVED' ORDER BY position FOR UPDATE`,
      [workspaceId, courseId],
    );
    const remainingTitles = new Set<string>();
    const normalized = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('pt-BR');
    const existingByTitle = new Map(existing.map((topic) => [normalized(topic.title), topic]));
    const selected: Array<TopicRow | undefined> = titles.map((title) => {
      const key = normalized(title);
      if (remainingTitles.has(key)) return undefined;
      remainingTitles.add(key);
      return existingByTitle.get(key);
    });
    const retainedIds = new Set(selected.filter((topic): topic is TopicRow => Boolean(topic)).map((topic) => topic.id));
    for (const topic of existing) {
      if (!retainedIds.has(topic.id)) {
        await connection.query(
          `UPDATE course_topics SET publication_status = 'ARCHIVED', updated_at = now() WHERE id = $1`, [topic.id],
        );
      }
    }
    const offset = existing.length + titles.length + 1;
    if (retainedIds.size) {
      await connection.query(
        `UPDATE course_topics SET position = position + $3
         WHERE workspace_id = $1 AND course_id = $2 AND id = ANY($4::uuid[])`,
        [workspaceId, courseId, offset, Array.from(retainedIds)],
      );
    }
    for (let index = 0; index < titles.length; index += 1) {
      const topic = selected[index];
      if (topic) {
        await connection.query(
          `UPDATE course_topics SET title = $2, position = $3, publication_status = 'PUBLISHED', updated_at = now()
           WHERE id = $1`, [topic.id, titles[index], index],
        );
      } else {
        await connection.query(
          `INSERT INTO course_topics (workspace_id, course_id, title, position, publication_status)
           VALUES ($1, $2, $3, $4, 'PUBLISHED')`, [workspaceId, courseId, titles[index], index],
        );
      }
    }
  }

  private async classView(userId: string, row: {
    id: string; workspace_id: string; course_id: string; teacher_user_id: string; name: string; period: string; created_at: Date; archived_at: Date | null;
  }, connection?: QueryConnection): Promise<ClassView> {
    if (!connection) return this.db.asActor(userId, (actorConnection) => this.classView(userId, row, actorConnection));
    const countRows = await connection.query<{ student_count: number | string | null }>(
      `SELECT CASE WHEN $2::uuid = $3::uuid THEN (
         SELECT count(*) FROM enrollments e WHERE e.workspace_id = $4 AND e.class_id = $1 AND e.role = 'STUDENT' AND e.status = 'ACTIVE'
       ) ELSE NULL END AS student_count`,
      [row.id, userId, row.teacher_user_id, row.workspace_id],
    );
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      courseId: row.course_id,
      teacherUserId: row.teacher_user_id,
      name: row.name,
      period: row.period,
      studentCount: countRows[0]?.student_count === null ? null : Number(countRows[0]?.student_count ?? 0),
      archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  private async materialView(connection: QueryConnection, userId: string, row: {
    id: string; workspace_id: string; course_id: string; owner_user_id: string; title: string; kind: string; classification: string;
    revision: number; archived_at: Date | null; created_at: Date; updated_at: Date;
  }) {
    const releases = await connection.query<{ class_id: string; released_at: Date }>(
      `SELECT r.class_id, r.released_at FROM material_class_releases r
       WHERE r.workspace_id = $1 AND r.material_id = $2 AND r.released_at IS NOT NULL AND r.revoked_at IS NULL
         AND (EXISTS (SELECT 1 FROM classes c WHERE c.id = r.class_id AND c.teacher_user_id = $3)
           OR EXISTS (SELECT 1 FROM enrollments e WHERE e.class_id = r.class_id AND e.user_id = $3 AND e.status = 'ACTIVE'))
       ORDER BY r.released_at DESC`, [row.workspace_id, row.id, userId],
    );
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      courseId: row.course_id,
      ownerUserId: row.owner_user_id,
      title: row.title,
      kind: row.kind,
      classification: row.classification,
      revision: Number(row.revision),
      archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      releases: releases.map((release) => ({ classId: release.class_id, releasedAt: new Date(release.released_at).toISOString() })),
    };
  }

  private decodeCursor(value?: string): Cursor | undefined {
    if (!value) return undefined;
    try {
      const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Cursor;
      if (!cursor || typeof cursor.id !== 'string' || typeof cursor.createdAt !== 'string' || Number.isNaN(Date.parse(cursor.createdAt))) throw new Error();
      return cursor;
    } catch {
      fail(400, 'VALIDATION_FAILED', 'Cursor inválido.');
    }
  }

  private decodeIdCursor(value?: string): string | undefined {
    if (!value) return undefined;
    try {
      const id = Buffer.from(value, 'base64url').toString('utf8');
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error();
      return id;
    } catch {
      fail(400, 'VALIDATION_FAILED', 'Cursor inválido.');
    }
  }

  private encodeCursor(row: { id: string; created_at: Date }): string {
    return Buffer.from(JSON.stringify({ id: row.id, createdAt: new Date(row.created_at).toISOString() })).toString('base64url');
  }

  private encodeIdCursor(id: string): string {
    return Buffer.from(id).toString('base64url');
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
