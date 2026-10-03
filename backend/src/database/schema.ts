import {
  bigint,
  index,
  integer,
  jsonb,
  boolean,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
};

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  emailNormalized: text('email_normalized').notNull(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true, mode: 'date' }),
  defaultPersona: text('default_persona').notNull(),
  status: text('status').notNull(),
  ...timestamps,
}, (table) => ({ email: uniqueIndex('users_email_normalized_uq').on(table.emailNormalized) }));

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  csrfTokenHash: text('csrf_token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  absoluteExpiresAt: timestamp('absolute_expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
  authenticatedAt: timestamp('authenticated_at', { withTimezone: true, mode: 'date' }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (table) => ({ token: uniqueIndex('sessions_token_hash_uq').on(table.tokenHash), user: index('sessions_user_expiry_idx').on(table.userId, table.expiresAt) }));

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  ownerUserId: uuid('owner_user_id'),
  aclVersion: integer('acl_version').notNull().default(1),
  ...timestamps,
});

export const workspaceMemberships = pgTable('workspace_memberships', {
  workspaceId: uuid('workspace_id').notNull(),
  userId: uuid('user_id').notNull(),
  status: text('status').notNull(),
  joinedAt: timestamp('joined_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => ({ pk: primaryKey({ columns: [table.workspaceId, table.userId] }), byUser: index('workspace_memberships_user_status_idx').on(table.userId, table.status) }));

export const workspaceRoles = pgTable('workspace_roles', {
  workspaceId: uuid('workspace_id').notNull(),
  userId: uuid('user_id').notNull(),
  role: text('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => ({ pk: primaryKey({ columns: [table.workspaceId, table.userId, table.role] }), byUser: index('workspace_roles_user_idx').on(table.userId, table.workspaceId) }));

export const courses = pgTable('courses', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull(),
  ownerUserId: uuid('owner_user_id').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  objectives: jsonb('objectives').$type<string[]>().notNull().default([]),
  revision: integer('revision').notNull().default(1),
  archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  ...timestamps,
}, (table) => ({ workspaceId: uniqueIndex('courses_workspace_id_uq').on(table.workspaceId, table.id), byOwner: index('courses_workspace_owner_idx').on(table.workspaceId, table.ownerUserId) }));

export const courseTopics = pgTable('course_topics', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull(),
  courseId: uuid('course_id').notNull(),
  title: text('title').notNull(),
  position: integer('position').notNull(),
  publicationStatus: text('publication_status').notNull().default('DRAFT'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => ({
  byCourse: index('course_topics_course_idx').on(table.workspaceId, table.courseId, table.position),
  activePosition: uniqueIndex('course_topics_active_position_uq').on(table.workspaceId, table.courseId, table.position)
    .where(sql`${table.publicationStatus} <> 'ARCHIVED'`),
}));

export const classes = pgTable('classes', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull(),
  courseId: uuid('course_id').notNull(),
  teacherUserId: uuid('teacher_user_id').notNull(),
  name: text('name').notNull(),
  period: text('period').notNull().default(''),
  archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  ...timestamps,
}, (table) => ({ workspaceId: uniqueIndex('classes_workspace_id_uq').on(table.workspaceId, table.id), byTeacher: index('classes_teacher_idx').on(table.teacherUserId, table.archivedAt) }));

export const enrollments = pgTable('enrollments', {
  workspaceId: uuid('workspace_id').notNull(),
  classId: uuid('class_id').notNull(),
  userId: uuid('user_id').notNull(),
  role: text('role').notNull(),
  status: text('status').notNull(),
  joinedAt: timestamp('joined_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => ({ pk: primaryKey({ columns: [table.classId, table.userId] }), byUser: index('enrollments_user_status_idx').on(table.userId, table.status) }));

export const classInvitations = pgTable('class_invitations', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull(),
  classId: uuid('class_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  maxUses: integer('max_uses').notNull(),
  usedCount: integer('used_count').notNull().default(0),
  revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => ({ token: uniqueIndex('class_invitations_token_hash_uq').on(table.tokenHash), byClass: index('class_invitations_class_idx').on(table.workspaceId, table.classId, table.expiresAt) }));

export const materials = pgTable('materials', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull(),
  courseId: uuid('course_id').notNull(),
  ownerUserId: uuid('owner_user_id').notNull(),
  title: text('title').notNull(),
  kind: text('kind').notNull(),
  classification: text('classification').notNull(),
  revision: integer('revision').notNull().default(1),
  archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  ...timestamps,
}, (table) => ({ workspaceId: uniqueIndex('materials_workspace_id_uq').on(table.workspaceId, table.id), byOwner: index('materials_workspace_owner_idx').on(table.workspaceId, table.ownerUserId) }));

export const materialClassReleases = pgTable('material_class_releases', {
  workspaceId: uuid('workspace_id').notNull(),
  materialId: uuid('material_id').notNull(),
  classId: uuid('class_id').notNull(),
  releasedAt: timestamp('released_at', { withTimezone: true, mode: 'date' }),
  revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
}, (table) => ({ pk: primaryKey({ columns: [table.materialId, table.classId] }), byClass: index('material_releases_class_idx').on(table.workspaceId, table.classId, table.revokedAt) }));

export const plans = pgTable('plans', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull(),
  catalogVersion: integer('catalog_version').notNull(),
});

export const planPrices = pgTable('plan_prices', {
  id: uuid('id').primaryKey(),
  planId: uuid('plan_id').notNull(),
  currency: text('currency').notNull(),
  billingInterval: text('interval').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2, mode: 'string' }).notNull(),
  validFrom: timestamp('valid_from', { withTimezone: true, mode: 'date' }).notNull(),
  validUntil: timestamp('valid_until', { withTimezone: true, mode: 'date' }),
});

export const planEntitlements = pgTable('plan_entitlements', {
  planId: uuid('plan_id').notNull(),
  capability: text('capability').notNull(),
  valueType: text('value_type').notNull(),
  value: jsonb('value').notNull(),
}, (table) => ({ pk: primaryKey({ columns: [table.planId, table.capability] }) }));

export const usageCounters = pgTable('usage_counters', {
  accountId: uuid('account_id').notNull(),
  metric: text('metric').notNull(),
  periodStart: timestamp('period_start', { withTimezone: true, mode: 'date' }).notNull(),
  used: bigint('used', { mode: 'number' }).notNull().default(0),
  reserved: bigint('reserved', { mode: 'number' }).notNull().default(0),
}, (table) => ({ pk: primaryKey({ columns: [table.accountId, table.metric, table.periodStart] }) }));

export const usageReservations = pgTable('usage_reservations', {
  id: uuid('id').primaryKey(),
  operationId: text('operation_id').notNull(),
  accountId: uuid('account_id').notNull(),
  metric: text('metric').notNull(),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  state: text('state').notNull(),
  periodStart: timestamp('period_start', { withTimezone: true, mode: 'date' }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (table) => ({ operation: uniqueIndex('usage_reservations_operation_metric_uq').on(table.operationId, table.metric) }));

export const billingAccounts = pgTable('billing_accounts', {
  id: uuid('id').primaryKey(),
  ownerUserId: uuid('owner_user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => ({ owner: uniqueIndex('billing_accounts_owner_user_id_uq').on(table.ownerUserId) }));

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey(),
  accountId: uuid('account_id').notNull(),
  planId: uuid('plan_id').notNull(),
  state: text('state').notNull(),
  periodStart: timestamp('period_start', { withTimezone: true, mode: 'date' }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true, mode: 'date' }).notNull(),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  providerRef: text('provider_ref'),
  ...timestamps,
}, (table) => ({ byAccount: index('subscriptions_account_state_idx').on(table.accountId, table.state, table.periodEnd) }));

export const usageEvents = pgTable('usage_events', {
  id: uuid('id').primaryKey(),
  operationId: text('operation_id').notNull(),
  accountId: uuid('account_id').notNull(),
  metric: text('metric').notNull(),
  delta: bigint('delta', { mode: 'number' }).notNull(),
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => ({ event: uniqueIndex('usage_events_operation_metric_reason_uq').on(table.operationId, table.metric, table.reason) }));

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').primaryKey(),
  actorId: uuid('actor_id'),
  action: text('action').notNull(),
  resourceType: text('resource_type'),
  resourceId: uuid('resource_id'),
  workspaceId: uuid('workspace_id'),
  requestId: text('request_id'),
  jobId: uuid('job_id'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => ({ byActor: index('audit_events_actor_created_idx').on(table.actorId, table.createdAt), byResource: index('audit_events_resource_idx').on(table.resourceType, table.resourceId, table.createdAt) }));

export const privacyRequests = pgTable('privacy_requests', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id'),
  type: text('type').notNull(),
  state: text('state').notNull(),
  resultStorageKey: text('result_storage_key'),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
  requestedAt: timestamp('requested_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
  errorCode: text('error_code'),
}, (table) => ({ byUser: index('privacy_requests_user_requested_idx').on(table.userId, table.requestedAt) }));

export const privacyOutbox = pgTable('privacy_outbox', {
  requestId: uuid('request_id').primaryKey(),
  actorId: uuid('actor_id').notNull(),
  workspaceId: uuid('workspace_id'),
  attempts: integer('attempts').notNull().default(0),
  claimedAt: timestamp('claimed_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => ({ claim: index('privacy_outbox_claim_idx').on(table.claimedAt, table.createdAt) }));

export const privacyExportCleanup = pgTable('privacy_export_cleanup', {
  requestId: uuid('request_id').primaryKey(),
  actorId: uuid('actor_id').notNull(),
  storageKey: text('storage_key').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  claimedAt: timestamp('claimed_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => ({ claim: index('privacy_export_cleanup_claim_idx').on(table.expiresAt, table.claimedAt) }));

export const accountTokens = pgTable('account_tokens', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  purpose: text('purpose').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => ({ token: uniqueIndex('account_tokens_token_hash_uq').on(table.tokenHash), byUserPurpose: index('account_tokens_user_purpose_idx').on(table.userId, table.purpose, table.expiresAt) }));

export const rateLimitBuckets = pgTable('rate_limit_buckets', {
  bucketKey: text('bucket_key').notNull(),
  windowStart: timestamp('window_start', { withTimezone: true, mode: 'date' }).notNull(),
  attempts: integer('attempts').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (table) => ({ pk: primaryKey({ columns: [table.bucketKey, table.windowStart] }), byExpiry: index('rate_limit_buckets_expiry_idx').on(table.expiresAt) }));

export const databaseSchema = {
  users,
  sessions,
  workspaces,
  workspaceMemberships,
  workspaceRoles,
  courses,
  courseTopics,
  classes,
  enrollments,
  classInvitations,
  materials,
  materialClassReleases,
  billingAccounts,
  plans,
  planPrices,
  planEntitlements,
  subscriptions,
  usageCounters,
  usageReservations,
  usageEvents,
  auditEvents,
  privacyRequests,
  privacyOutbox,
  privacyExportCleanup,
  accountTokens,
  rateLimitBuckets,
};
