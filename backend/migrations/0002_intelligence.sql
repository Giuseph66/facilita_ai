CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE ai_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider = 'ollama'),
  ciphertext bytea NOT NULL,
  nonce bytea NOT NULL,
  auth_tag bytea NOT NULL,
  key_version text NOT NULL,
  masked_suffix text NOT NULL,
  status text NOT NULL DEFAULT 'UNVERIFIED' CHECK (status IN ('UNVERIFIED','CONNECTED','INVALID')),
  checked_at timestamptz,
  credential_revision integer NOT NULL DEFAULT 1 CHECK (credential_revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider),
  UNIQUE (user_id, id)
);

CREATE TABLE ai_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'BYOK' CHECK (mode IN ('BYOK','PLATFORM')),
  preferred_model text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL,
  attempt integer NOT NULL CHECK (attempt > 0),
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payer_scope text NOT NULL CHECK (payer_scope IN ('BYOK','PLATFORM','EMBEDDING')),
  provider text NOT NULL,
  model text,
  feature text NOT NULL,
  input_tokens integer,
  cached_input_tokens integer,
  output_tokens integer,
  token_source text NOT NULL CHECK (token_source IN ('MEASURED','ESTIMATED','UNKNOWN')),
  estimated_cost numeric,
  currency char(3),
  price_version text,
  latency_ms integer,
  success boolean NOT NULL,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, attempt)
);
CREATE INDEX ai_usage_events_actor_created_idx ON ai_usage_events(actor_id, created_at DESC);

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature text NOT NULL,
  state text NOT NULL DEFAULT 'QUEUED' CHECK (state IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED')),
  stage text NOT NULL DEFAULT 'QUEUED',
  progress integer CHECK (progress IS NULL OR progress BETWEEN 0 AND 100),
  resource_type text NOT NULL,
  resource_id uuid,
  payload jsonb NOT NULL,
  idempotency_key text,
  payload_hash text NOT NULL,
  payload_version integer NOT NULL DEFAULT 1 CHECK (payload_version > 0),
  result jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, id, actor_id),
  UNIQUE (actor_id, feature, idempotency_key)
);
CREATE INDEX jobs_actor_created_idx ON jobs(actor_id, created_at DESC);
CREATE INDEX jobs_state_created_idx ON jobs(state, created_at) WHERE state IN ('QUEUED','RUNNING');

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  job_id uuid NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL,
  state text NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','DISPATCHED','DONE','FAILED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz,
  locked_until timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  UNIQUE (job_id, type),
  FOREIGN KEY (workspace_id, job_id, actor_id) REFERENCES jobs(workspace_id, id, actor_id) ON DELETE CASCADE,
  CHECK (payload = jsonb_build_object('jobId', job_id::text, 'actorId', actor_id::text, 'workspaceId', workspace_id::text))
);
CREATE INDEX outbox_pending_idx ON outbox_events(created_at) WHERE state = 'PENDING';

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  material_id uuid NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_storage_key text NOT NULL UNIQUE,
  original_name text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('application/pdf','application/vnd.openxmlformats-officedocument.presentationml.presentation')),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  sha256 text NOT NULL,
  upload_idempotency_key text,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','PROCESSING','READY','FAILED','DELETING','DELETED')),
  stage text NOT NULL DEFAULT 'QUEUED',
  error_code text,
  active_version_id uuid,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, id, active_version_id),
  UNIQUE (owner_user_id, upload_idempotency_key),
  FOREIGN KEY (workspace_id, material_id) REFERENCES materials(workspace_id, id)
);
CREATE INDEX documents_material_status_idx ON documents(workspace_id, material_id, status);

CREATE TABLE document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  document_id uuid NOT NULL,
  job_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  parser_version text NOT NULL,
  chunker_version text NOT NULL,
  embedding_fingerprint text NOT NULL,
  status text NOT NULL CHECK (status IN ('PROCESSING','READY','FAILED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, document_id, id),
  UNIQUE (document_id, version),
  FOREIGN KEY (workspace_id, document_id) REFERENCES documents(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, job_id) REFERENCES jobs(workspace_id, id) ON DELETE CASCADE
);
ALTER TABLE documents ADD CONSTRAINT documents_active_version_fk
  FOREIGN KEY (workspace_id, id, active_version_id) REFERENCES document_versions(workspace_id, document_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE document_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  version_id uuid NOT NULL,
  page_number integer NOT NULL CHECK (page_number > 0),
  extracted_text text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (workspace_id, id),
  UNIQUE (version_id, page_number),
  UNIQUE (workspace_id, version_id, id, page_number),
  FOREIGN KEY (workspace_id, version_id) REFERENCES document_versions(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  version_id uuid NOT NULL,
  page_id uuid NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  content text NOT NULL,
  token_count integer NOT NULL CHECK (token_count >= 0),
  content_hash text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, version_id, id),
  UNIQUE (workspace_id, version_id, id, page_id),
  UNIQUE (version_id, page_id, position),
  FOREIGN KEY (workspace_id, version_id) REFERENCES document_versions(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, page_id) REFERENCES document_pages(workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX document_chunks_content_hash_idx ON document_chunks(content_hash);

CREATE TABLE document_chunk_embeddings (
  workspace_id uuid NOT NULL,
  chunk_id uuid NOT NULL,
  embedding_fingerprint text NOT NULL,
  embedding vector(384) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, chunk_id, embedding_fingerprint),
  FOREIGN KEY (workspace_id, chunk_id) REFERENCES document_chunks(workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX document_chunk_embeddings_fingerprint_idx ON document_chunk_embeddings(embedding_fingerprint);

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('STUDENT_TUTOR','TEACHER_ASSISTANT')),
  title text NOT NULL DEFAULT 'Nova conversa',
  context_revision integer NOT NULL DEFAULT 1 CHECK (context_revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id)
);
CREATE INDEX conversations_owner_updated_idx ON conversations(owner_user_id, updated_at DESC);

CREATE TABLE conversation_contexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('COURSE','DOCUMENT')),
  course_id uuid,
  document_id uuid,
  CHECK ((type = 'COURSE' AND course_id IS NOT NULL AND document_id IS NULL) OR (type = 'DOCUMENT' AND document_id IS NOT NULL AND course_id IS NULL)),
  FOREIGN KEY (workspace_id, conversation_id) REFERENCES conversations(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, course_id) REFERENCES courses(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, document_id) REFERENCES documents(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('USER','ASSISTANT')),
  content text NOT NULL,
  state text NOT NULL DEFAULT 'SUCCEEDED' CHECK (state IN ('PENDING','SUCCEEDED','FAILED')),
  client_message_id text,
  citation_count integer NOT NULL DEFAULT 0 CHECK (citation_count >= 0),
  invalidated_at timestamptz,
  prompt_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (conversation_id, client_message_id),
  FOREIGN KEY (workspace_id, conversation_id) REFERENCES conversations(workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX messages_conversation_created_idx ON messages(conversation_id, created_at, id);

CREATE TABLE message_citations (
  workspace_id uuid NOT NULL,
  message_id uuid NOT NULL,
  document_version_id uuid NOT NULL,
  chunk_id uuid NOT NULL,
  page_id uuid NOT NULL,
  page_number integer NOT NULL CHECK (page_number > 0),
  label text NOT NULL,
  PRIMARY KEY (workspace_id, message_id, chunk_id),
  FOREIGN KEY (workspace_id, message_id) REFERENCES messages(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, document_version_id, chunk_id, page_id) REFERENCES document_chunks(workspace_id, version_id, id, page_id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, document_version_id, page_id, page_number) REFERENCES document_pages(workspace_id, version_id, id, page_number) ON DELETE CASCADE
);

CREATE TABLE conversation_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  until_message_id uuid NOT NULL,
  content text NOT NULL,
  source_scope_version integer NOT NULL,
  prompt_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  invalidated_at timestamptz,
  FOREIGN KEY (workspace_id, conversation_id) REFERENCES conversations(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, until_message_id) REFERENCES messages(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE study_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id uuid,
  kind text NOT NULL CHECK (kind IN ('SUMMARY','EXPLANATION','FLASHCARDS','STUDY_PLAN','REVIEW','SIMILAR_EXERCISES','PRACTICE_TEST')),
  title text,
  payload jsonb NOT NULL,
  schema_version text NOT NULL,
  source_count integer NOT NULL DEFAULT 0 CHECK (source_count >= 0),
  generation_job_id uuid,
  invalidated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, generation_job_id),
  FOREIGN KEY (workspace_id, course_id) REFERENCES courses(workspace_id, id),
  FOREIGN KEY (workspace_id, generation_job_id) REFERENCES jobs(workspace_id, id)
);
CREATE INDEX study_artifacts_owner_created_idx ON study_artifacts(owner_user_id, created_at DESC);

CREATE TABLE study_artifact_sources (
  workspace_id uuid NOT NULL,
  artifact_id uuid NOT NULL,
  document_version_id uuid NOT NULL,
  chunk_id uuid,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  UNIQUE (workspace_id, artifact_id, document_version_id, chunk_id),
  FOREIGN KEY (workspace_id, artifact_id) REFERENCES study_artifacts(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, document_version_id) REFERENCES document_versions(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, document_version_id, chunk_id) REFERENCES document_chunks(workspace_id, version_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX study_artifact_sources_unique_idx ON study_artifact_sources(
  workspace_id, artifact_id, document_version_id,
  COALESCE(chunk_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

CREATE TABLE assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL,
  class_id uuid,
  title text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('QUIZ','EXAM','ASSIGNMENT')),
  state text NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT','READY','PUBLISHED','ARCHIVED')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  family_id uuid NOT NULL DEFAULT gen_random_uuid(),
  variant_label text,
  copied_from_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, course_id) REFERENCES courses(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, class_id) REFERENCES classes(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, copied_from_id) REFERENCES assessments(workspace_id, id) ON DELETE SET NULL (copied_from_id)
);
CREATE INDEX assessments_author_idx ON assessments(author_user_id, updated_at DESC);

CREATE TABLE assessment_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  assessment_id uuid NOT NULL,
  position integer NOT NULL CHECK (position > 0),
  type text NOT NULL CHECK (type IN ('MULTIPLE_CHOICE','SHORT_ANSWER','ESSAY')),
  statement text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  difficulty text NOT NULL CHECK (difficulty IN ('EASY','MEDIUM','HARD')),
  points numeric NOT NULL CHECK (points >= 0),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  UNIQUE (workspace_id, id),
  UNIQUE (assessment_id, position),
  FOREIGN KEY (workspace_id, assessment_id) REFERENCES assessments(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE assessment_answers (
  workspace_id uuid NOT NULL,
  question_id uuid NOT NULL,
  correct_option_id text,
  expected_answer text,
  rubric jsonb,
  PRIMARY KEY (workspace_id, question_id),
  FOREIGN KEY (workspace_id, question_id) REFERENCES assessment_questions(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE assessment_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  assessment_id uuid NOT NULL,
  job_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  model text,
  prompt_name text NOT NULL,
  prompt_version text NOT NULL,
  schema_version text NOT NULL,
  configuration jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, job_id),
  FOREIGN KEY (workspace_id, assessment_id) REFERENCES assessments(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, job_id) REFERENCES jobs(workspace_id, id) ON DELETE RESTRICT
);

CREATE TABLE assessment_generation_sources (
  workspace_id uuid NOT NULL,
  generation_id uuid NOT NULL,
  document_version_id uuid NOT NULL,
  chunk_id uuid NOT NULL,
  page_id uuid NOT NULL,
  page_number integer NOT NULL CHECK (page_number > 0),
  PRIMARY KEY (workspace_id, generation_id, chunk_id),
  FOREIGN KEY (workspace_id, generation_id) REFERENCES assessment_generations(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, document_version_id, chunk_id, page_id) REFERENCES document_chunks(workspace_id, version_id, id, page_id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, document_version_id, page_id, page_number) REFERENCES document_pages(workspace_id, version_id, id, page_number) ON DELETE CASCADE
);

CREATE TABLE study_blueprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  class_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT','PUBLISHED','ARCHIVED')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  difficulty text NOT NULL CHECK (difficulty IN ('EASY','MEDIUM','HARD','MIXED')),
  objectives_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(objectives_snapshot) = 'array'),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, class_id, revision),
  FOREIGN KEY (workspace_id, class_id) REFERENCES classes(workspace_id, id) ON DELETE CASCADE
);
CREATE TABLE study_blueprint_topics (
  workspace_id uuid NOT NULL,
  blueprint_id uuid NOT NULL,
  course_topic_id uuid NOT NULL,
  topic_title_snapshot text NOT NULL CHECK (char_length(topic_title_snapshot) BETWEEN 1 AND 240),
  topic_position_snapshot integer NOT NULL CHECK (topic_position_snapshot >= 0),
  competency_code text NOT NULL DEFAULT '',
  PRIMARY KEY (workspace_id, blueprint_id, course_topic_id, competency_code),
  FOREIGN KEY (workspace_id, blueprint_id) REFERENCES study_blueprints(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE practice_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  artifact_id uuid,
  state text NOT NULL DEFAULT 'READY' CHECK (state IN ('READY','ARCHIVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, artifact_id) REFERENCES study_artifacts(workspace_id, id) ON DELETE SET NULL (artifact_id)
);
CREATE TABLE practice_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  test_id uuid NOT NULL,
  position integer NOT NULL CHECK (position > 0),
  statement text NOT NULL,
  options jsonb NOT NULL,
  topic_ids uuid[] NOT NULL DEFAULT '{}',
  UNIQUE (workspace_id, id),
  UNIQUE (test_id, position),
  FOREIGN KEY (workspace_id, test_id) REFERENCES practice_tests(workspace_id, id) ON DELETE CASCADE
);
CREATE TABLE practice_answers (
  workspace_id uuid NOT NULL,
  question_id uuid NOT NULL,
  correct_option_id text NOT NULL,
  explanation text,
  rubric jsonb,
  PRIMARY KEY (workspace_id, question_id),
  FOREIGN KEY (workspace_id, question_id) REFERENCES practice_questions(workspace_id, id) ON DELETE CASCADE
);
CREATE TABLE practice_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  test_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'IN_PROGRESS' CHECK (state IN ('IN_PROGRESS','SUBMITTED')),
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  question_snapshot jsonb NOT NULL,
  result jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, test_id) REFERENCES practice_tests(workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX practice_attempts_user_idx ON practice_attempts(user_id, started_at DESC);

CREATE TABLE exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assessment_id uuid NOT NULL,
  assessment_revision integer NOT NULL,
  format text NOT NULL CHECK (format IN ('PDF','PRINT')),
  variant text NOT NULL CHECK (variant IN ('QUESTIONS','ANSWER_KEY')),
  storage_key text,
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','READY','FAILED','EXPIRED')),
  job_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, job_id),
  FOREIGN KEY (workspace_id, assessment_id) REFERENCES assessments(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, job_id) REFERENCES jobs(workspace_id, id) ON DELETE RESTRICT
);

CREATE FUNCTION intelligence_can_read_document(p_workspace_id uuid, p_document_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM documents d
    JOIN materials m ON m.workspace_id = d.workspace_id AND m.id = d.material_id
    WHERE d.workspace_id = p_workspace_id AND d.id = p_document_id AND d.deleted_at IS NULL
      AND (
        d.owner_user_id::text = NULLIF(current_setting('app.user_id', true), '')
        OR (m.classification = 'ACADEMIC' AND EXISTS (
          SELECT 1 FROM material_class_releases r
          JOIN enrollments e ON e.workspace_id = r.workspace_id AND e.class_id = r.class_id
          WHERE r.workspace_id = d.workspace_id AND r.material_id = m.id
            AND r.revoked_at IS NULL AND e.user_id::text = NULLIF(current_setting('app.user_id', true), '')
            AND e.role = 'STUDENT' AND e.status = 'ACTIVE'
        ))
      )
  );
$$;

CREATE FUNCTION intelligence_owns_document(p_workspace_id uuid, p_document_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM documents d
    WHERE d.workspace_id = p_workspace_id AND d.id = p_document_id
      AND d.owner_user_id::text = NULLIF(current_setting('app.user_id', true), '')
  );
$$;

CREATE FUNCTION intelligence_owns_version(p_workspace_id uuid, p_version_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM document_versions v
    WHERE v.workspace_id = p_workspace_id AND v.id = p_version_id
      AND intelligence_owns_document(v.workspace_id, v.document_id)
  );
$$;

CREATE FUNCTION intelligence_owns_chunk(p_workspace_id uuid, p_chunk_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM document_chunks c
    WHERE c.workspace_id = p_workspace_id AND c.id = p_chunk_id
      AND intelligence_owns_version(c.workspace_id, c.version_id)
  );
$$;

ALTER TABLE ai_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY ai_connections_owner ON ai_connections USING (user_id::text = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK (user_id::text = NULLIF(current_setting('app.user_id', true), ''));
ALTER TABLE ai_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_preferences FORCE ROW LEVEL SECURITY;
CREATE POLICY ai_preferences_owner ON ai_preferences USING (user_id::text = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK (user_id::text = NULLIF(current_setting('app.user_id', true), ''));
ALTER TABLE ai_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_events FORCE ROW LEVEL SECURITY;
CREATE POLICY ai_usage_owner ON ai_usage_events USING (actor_id::text = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK (actor_id::text = NULLIF(current_setting('app.user_id', true), ''));

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY jobs_actor ON jobs USING (actor_id::text = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK (actor_id::text = NULLIF(current_setting('app.user_id', true), ''));
-- Technical dispatcher sees only job IDs and the minimal actor/workspace envelope.

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;
CREATE POLICY documents_visible ON documents FOR SELECT USING (
  owner_user_id::text = NULLIF(current_setting('app.user_id', true), '')
  OR (deleted_at IS NULL AND EXISTS (
      SELECT 1 FROM materials m
      JOIN material_class_releases r ON r.workspace_id = m.workspace_id AND r.material_id = m.id AND r.revoked_at IS NULL
      JOIN enrollments e ON e.workspace_id = r.workspace_id AND e.class_id = r.class_id AND e.role = 'STUDENT' AND e.status = 'ACTIVE'
      WHERE m.workspace_id = documents.workspace_id AND m.id = documents.material_id
        AND m.classification = 'ACADEMIC' AND e.user_id::text = NULLIF(current_setting('app.user_id', true), '')
))
);
CREATE POLICY documents_owner_write ON documents FOR ALL
  USING (owner_user_id::text = NULLIF(current_setting('app.user_id', true), ''))
  WITH CHECK (owner_user_id::text = NULLIF(current_setting('app.user_id', true), ''));

ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY document_versions_visible ON document_versions FOR SELECT USING (intelligence_can_read_document(workspace_id, document_id));
CREATE POLICY document_versions_owner_write ON document_versions FOR ALL USING (intelligence_owns_document(workspace_id, document_id)) WITH CHECK (intelligence_owns_document(workspace_id, document_id));
ALTER TABLE document_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_pages FORCE ROW LEVEL SECURITY;
CREATE POLICY document_pages_visible ON document_pages FOR SELECT USING (EXISTS (SELECT 1 FROM document_versions v WHERE v.workspace_id = document_pages.workspace_id AND v.id = document_pages.version_id));
CREATE POLICY document_pages_owner_write ON document_pages FOR ALL USING (intelligence_owns_version(workspace_id, version_id)) WITH CHECK (intelligence_owns_version(workspace_id, version_id));
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks FORCE ROW LEVEL SECURITY;
CREATE POLICY document_chunks_visible ON document_chunks FOR SELECT USING (EXISTS (SELECT 1 FROM document_versions v WHERE v.workspace_id = document_chunks.workspace_id AND v.id = document_chunks.version_id));
CREATE POLICY document_chunks_owner_write ON document_chunks FOR ALL USING (intelligence_owns_version(workspace_id, version_id)) WITH CHECK (intelligence_owns_version(workspace_id, version_id));
ALTER TABLE document_chunk_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunk_embeddings FORCE ROW LEVEL SECURITY;
CREATE POLICY document_embeddings_visible ON document_chunk_embeddings FOR SELECT USING (EXISTS (SELECT 1 FROM document_chunks c WHERE c.workspace_id = document_chunk_embeddings.workspace_id AND c.id = document_chunk_embeddings.chunk_id));
CREATE POLICY document_embeddings_owner_write ON document_chunk_embeddings FOR ALL USING (intelligence_owns_chunk(workspace_id, chunk_id)) WITH CHECK (intelligence_owns_chunk(workspace_id, chunk_id));

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;
CREATE POLICY conversations_owner ON conversations USING (owner_user_id::text = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK (owner_user_id::text = NULLIF(current_setting('app.user_id', true), ''));
ALTER TABLE conversation_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_contexts FORCE ROW LEVEL SECURITY;
CREATE POLICY contexts_owner ON conversation_contexts USING (EXISTS (SELECT 1 FROM conversations c WHERE c.workspace_id = conversation_contexts.workspace_id AND c.id = conversation_contexts.conversation_id));
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;
CREATE POLICY messages_owner ON messages USING (EXISTS (SELECT 1 FROM conversations c WHERE c.workspace_id = messages.workspace_id AND c.id = messages.conversation_id));
ALTER TABLE message_citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_citations FORCE ROW LEVEL SECURITY;
CREATE POLICY citations_owner ON message_citations USING (EXISTS (SELECT 1 FROM messages m WHERE m.workspace_id = message_citations.workspace_id AND m.id = message_citations.message_id));
ALTER TABLE conversation_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_summaries FORCE ROW LEVEL SECURITY;
CREATE POLICY summaries_owner ON conversation_summaries USING (EXISTS (SELECT 1 FROM conversations c WHERE c.workspace_id = conversation_summaries.workspace_id AND c.id = conversation_summaries.conversation_id));

ALTER TABLE study_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_artifacts FORCE ROW LEVEL SECURITY;
CREATE POLICY study_artifacts_owner ON study_artifacts USING (owner_user_id::text = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK (owner_user_id::text = NULLIF(current_setting('app.user_id', true), ''));
ALTER TABLE study_artifact_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_artifact_sources FORCE ROW LEVEL SECURITY;
CREATE POLICY study_artifact_sources_owner ON study_artifact_sources USING (EXISTS (SELECT 1 FROM study_artifacts a WHERE a.workspace_id = study_artifact_sources.workspace_id AND a.id = study_artifact_sources.artifact_id));

ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments FORCE ROW LEVEL SECURITY;
CREATE POLICY assessments_author ON assessments USING (author_user_id::text = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK (author_user_id::text = NULLIF(current_setting('app.user_id', true), ''));
ALTER TABLE assessment_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_questions FORCE ROW LEVEL SECURITY;
CREATE POLICY assessment_questions_author ON assessment_questions USING (EXISTS (SELECT 1 FROM assessments a WHERE a.workspace_id = assessment_questions.workspace_id AND a.id = assessment_questions.assessment_id));
ALTER TABLE assessment_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_answers FORCE ROW LEVEL SECURITY;
CREATE POLICY assessment_answers_author ON assessment_answers USING (EXISTS (SELECT 1 FROM assessment_questions q WHERE q.workspace_id = assessment_answers.workspace_id AND q.id = assessment_answers.question_id));
ALTER TABLE assessment_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_generations FORCE ROW LEVEL SECURITY;
CREATE POLICY assessment_generations_author ON assessment_generations USING (EXISTS (SELECT 1 FROM assessments a WHERE a.workspace_id = assessment_generations.workspace_id AND a.id = assessment_generations.assessment_id));
ALTER TABLE assessment_generation_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_generation_sources FORCE ROW LEVEL SECURITY;
CREATE POLICY assessment_generation_sources_author ON assessment_generation_sources USING (EXISTS (SELECT 1 FROM assessment_generations g WHERE g.workspace_id = assessment_generation_sources.workspace_id AND g.id = assessment_generation_sources.generation_id));

ALTER TABLE study_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_blueprints FORCE ROW LEVEL SECURITY;
CREATE POLICY study_blueprints_visible ON study_blueprints FOR SELECT USING (
  created_by::text = NULLIF(current_setting('app.user_id', true), '') OR
  EXISTS (
    SELECT 1 FROM classes cl JOIN courses co ON co.workspace_id = cl.workspace_id AND co.id = cl.course_id
    WHERE cl.workspace_id = study_blueprints.workspace_id AND cl.id = study_blueprints.class_id
      AND cl.archived_at IS NULL
      AND (cl.teacher_user_id::text = NULLIF(current_setting('app.user_id', true), '')
        OR co.owner_user_id::text = NULLIF(current_setting('app.user_id', true), ''))
  ) OR
  (state = 'PUBLISHED' AND EXISTS (
    SELECT 1 FROM enrollments e WHERE e.workspace_id = study_blueprints.workspace_id AND e.class_id = study_blueprints.class_id
      AND e.user_id::text = NULLIF(current_setting('app.user_id', true), '') AND e.role = 'STUDENT' AND e.status = 'ACTIVE'
  ))
);
CREATE POLICY study_blueprints_owner_insert ON study_blueprints FOR INSERT
  WITH CHECK (created_by::text = NULLIF(current_setting('app.user_id', true), '') AND state = 'DRAFT');
CREATE POLICY study_blueprints_owner_update ON study_blueprints FOR UPDATE
  USING (created_by::text = NULLIF(current_setting('app.user_id', true), '') AND state = 'DRAFT')
  WITH CHECK (created_by::text = NULLIF(current_setting('app.user_id', true), '') AND state IN ('DRAFT','PUBLISHED','ARCHIVED'));
ALTER TABLE study_blueprint_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_blueprint_topics FORCE ROW LEVEL SECURITY;
CREATE POLICY study_blueprint_topics_visible ON study_blueprint_topics FOR SELECT USING (EXISTS (SELECT 1 FROM study_blueprints b WHERE b.workspace_id = study_blueprint_topics.workspace_id AND b.id = study_blueprint_topics.blueprint_id));
CREATE POLICY study_blueprint_topics_owner_insert ON study_blueprint_topics FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM study_blueprints b WHERE b.workspace_id = study_blueprint_topics.workspace_id AND b.id = study_blueprint_topics.blueprint_id AND b.created_by::text = NULLIF(current_setting('app.user_id', true), '') AND b.state = 'DRAFT'));
CREATE POLICY study_blueprint_topics_owner_update ON study_blueprint_topics FOR UPDATE USING (EXISTS (SELECT 1 FROM study_blueprints b WHERE b.workspace_id = study_blueprint_topics.workspace_id AND b.id = study_blueprint_topics.blueprint_id AND b.created_by::text = NULLIF(current_setting('app.user_id', true), '') AND b.state = 'DRAFT')) WITH CHECK (EXISTS (SELECT 1 FROM study_blueprints b WHERE b.workspace_id = study_blueprint_topics.workspace_id AND b.id = study_blueprint_topics.blueprint_id AND b.created_by::text = NULLIF(current_setting('app.user_id', true), '') AND b.state = 'DRAFT'));
CREATE POLICY study_blueprint_topics_owner_delete ON study_blueprint_topics FOR DELETE USING (EXISTS (SELECT 1 FROM study_blueprints b WHERE b.workspace_id = study_blueprint_topics.workspace_id AND b.id = study_blueprint_topics.blueprint_id AND b.created_by::text = NULLIF(current_setting('app.user_id', true), '') AND b.state = 'DRAFT'));

ALTER TABLE practice_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_tests FORCE ROW LEVEL SECURITY;
CREATE POLICY practice_tests_owner_read ON practice_tests FOR SELECT USING (owner_user_id::text = NULLIF(current_setting('app.user_id', true), ''));
CREATE POLICY practice_tests_owner_insert ON practice_tests FOR INSERT WITH CHECK (owner_user_id::text = NULLIF(current_setting('app.user_id', true), ''));
ALTER TABLE practice_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_questions FORCE ROW LEVEL SECURITY;
CREATE POLICY practice_questions_owner_read ON practice_questions FOR SELECT USING (EXISTS (SELECT 1 FROM practice_tests t WHERE t.workspace_id = practice_questions.workspace_id AND t.id = practice_questions.test_id AND t.owner_user_id::text = NULLIF(current_setting('app.user_id', true), '')));
CREATE POLICY practice_questions_owner_insert ON practice_questions FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM practice_tests t WHERE t.workspace_id = practice_questions.workspace_id AND t.id = practice_questions.test_id AND t.owner_user_id::text = NULLIF(current_setting('app.user_id', true), '')));
ALTER TABLE practice_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_answers FORCE ROW LEVEL SECURITY;
CREATE POLICY practice_answers_after_submission ON practice_answers FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM practice_questions q
    JOIN practice_tests t ON t.workspace_id = q.workspace_id AND t.id = q.test_id
    JOIN practice_attempts a ON a.workspace_id = t.workspace_id AND a.test_id = t.id
    WHERE q.workspace_id = practice_answers.workspace_id AND q.id = practice_answers.question_id
      AND t.owner_user_id::text = NULLIF(current_setting('app.user_id', true), '')
      AND a.user_id::text = NULLIF(current_setting('app.user_id', true), '') AND a.state = 'SUBMITTED'
  )
);
CREATE POLICY practice_answers_owner_insert ON practice_answers FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM practice_questions q JOIN practice_tests t ON t.workspace_id=q.workspace_id AND t.id=q.test_id
          WHERE q.workspace_id=practice_answers.workspace_id AND q.id=practice_answers.question_id
            AND t.owner_user_id::text = NULLIF(current_setting('app.user_id', true), ''))
);
ALTER TABLE practice_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY practice_attempts_owner_read ON practice_attempts FOR SELECT USING (user_id::text = NULLIF(current_setting('app.user_id', true), ''));
CREATE POLICY practice_attempts_start ON practice_attempts FOR INSERT WITH CHECK (
  user_id::text = NULLIF(current_setting('app.user_id', true), '') AND state = 'IN_PROGRESS'
  AND answers = '{}'::jsonb AND result IS NULL AND submitted_at IS NULL
);
CREATE POLICY practice_attempts_submit ON practice_attempts FOR UPDATE
  USING (user_id::text = NULLIF(current_setting('app.user_id', true), '') AND state IN ('IN_PROGRESS','SUBMITTED'))
  WITH CHECK (user_id::text = NULLIF(current_setting('app.user_id', true), '') AND state = 'SUBMITTED' AND submitted_at IS NOT NULL);

ALTER TABLE exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE exports FORCE ROW LEVEL SECURITY;
CREATE POLICY exports_actor ON exports USING (actor_id::text = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK (actor_id::text = NULLIF(current_setting('app.user_id', true), ''));

CREATE FUNCTION public.submit_practice_attempt(p_attempt_id uuid, p_answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_id uuid := NULLIF(current_setting('app.user_id', true), '')::uuid;
  v_attempt public.practice_attempts%ROWTYPE;
  v_test public.practice_tests%ROWTYPE;
  v_source_count integer;
  v_valid_source_count integer;
  v_question jsonb;
  v_question_row public.practice_questions%ROWTYPE;
  v_answer_count integer;
  v_question_count integer;
  v_answer_map jsonb;
  v_question_id uuid;
  v_option_id text;
  v_selected_option text;
  v_correct_option text;
  v_correct_count integer := 0;
  v_total integer;
  v_feedback jsonb;
  v_result jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PRACTICE_ACTOR_REQUIRED';
  END IF;

  SELECT a.* INTO v_attempt
  FROM public.practice_attempts a
  WHERE a.id = p_attempt_id AND a.user_id = v_actor_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRACTICE_ATTEMPT_NOT_FOUND';
  END IF;
  IF v_attempt.state <> 'IN_PROGRESS' OR v_attempt.result IS NOT NULL OR v_attempt.submitted_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRACTICE_ATTEMPT_ALREADY_SUBMITTED';
  END IF;
  IF v_attempt.question_snapshot IS NULL OR jsonb_typeof(v_attempt.question_snapshot) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRACTICE_SNAPSHOT_INVALID';
  END IF;
  IF jsonb_array_length(v_attempt.question_snapshot) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRACTICE_SNAPSHOT_INVALID';
  END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRACTICE_ANSWERS_INVALID';
  END IF;

  SELECT count(*)::integer, count(DISTINCT item->>'questionId')::integer
    INTO v_answer_count, v_question_count
  FROM jsonb_array_elements(p_answers) AS input(item);
  v_total := jsonb_array_length(v_attempt.question_snapshot);
  IF v_answer_count <> v_total OR v_question_count <> v_total OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_answers) AS input(item)
    WHERE CASE WHEN jsonb_typeof(item) = 'object' THEN
      NOT (item ?& ARRAY['questionId','optionId'])
      OR item - ARRAY['questionId','optionId'] <> '{}'::jsonb
      OR jsonb_typeof(item->'questionId') <> 'string'
      OR jsonb_typeof(item->'optionId') <> 'string'
      OR length(item->>'questionId') > 80
      OR length(item->>'optionId') > 100
    ELSE true END
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRACTICE_ANSWERS_INVALID';
  END IF;
  SELECT COALESCE(jsonb_object_agg(item->>'questionId', to_jsonb(item->>'optionId')), '{}'::jsonb)
    INTO v_answer_map
  FROM jsonb_array_elements(p_answers) AS input(item);

  SELECT t.* INTO v_test
  FROM public.practice_tests t
  WHERE t.workspace_id = v_attempt.workspace_id AND t.id = v_attempt.test_id
    AND t.owner_user_id = v_actor_id AND t.state = 'READY'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRACTICE_TEST_NOT_AVAILABLE';
  END IF;
  IF v_test.artifact_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRACTICE_SOURCE_REVOKED';
  END IF;
  SELECT a.source_count INTO v_source_count FROM public.study_artifacts a
  WHERE a.workspace_id = v_attempt.workspace_id AND a.id = v_test.artifact_id
    AND a.owner_user_id = v_actor_id AND a.invalidated_at IS NULL;
  IF NOT FOUND OR v_source_count IS NULL OR v_source_count < 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRACTICE_SOURCE_REVOKED';
  END IF;
  SELECT count(*)::integer INTO v_valid_source_count
  FROM public.study_artifact_sources s
  JOIN public.document_versions v ON v.workspace_id = s.workspace_id AND v.id = s.document_version_id
  JOIN public.documents d ON d.workspace_id = v.workspace_id AND d.id = v.document_id
  JOIN public.document_chunks c ON c.workspace_id = s.workspace_id AND c.version_id = v.id AND c.id = s.chunk_id
  JOIN public.document_pages p ON p.workspace_id = c.workspace_id AND p.version_id = v.id AND p.id = c.page_id
  WHERE s.workspace_id = v_attempt.workspace_id AND s.artifact_id = v_test.artifact_id
    AND d.active_version_id = v.id AND d.status = 'READY' AND d.deleted_at IS NULL AND v.status = 'READY'
    AND public.intelligence_can_read_document(d.workspace_id, d.id);
  IF v_valid_source_count <> v_source_count OR (
    SELECT count(*)::integer FROM public.study_artifact_sources s
    WHERE s.workspace_id = v_attempt.workspace_id AND s.artifact_id = v_test.artifact_id
  ) <> v_source_count THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRACTICE_SOURCE_REVOKED';
  END IF;

  SELECT count(*)::integer INTO v_question_count
  FROM public.practice_questions q WHERE q.workspace_id = v_attempt.workspace_id AND q.test_id = v_attempt.test_id;
  IF v_question_count <> v_total OR (
    SELECT count(DISTINCT item->>'id')::integer FROM jsonb_array_elements(v_attempt.question_snapshot) AS snapshot(item)
  ) <> v_total THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRACTICE_SNAPSHOT_INVALID';
  END IF;

  FOR v_question IN SELECT value FROM jsonb_array_elements(v_attempt.question_snapshot)
  LOOP
    IF jsonb_typeof(v_question->'id') <> 'string' OR jsonb_typeof(v_question->'options') <> 'array'
       OR jsonb_typeof(v_question->'topicIds') <> 'array' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRACTICE_SNAPSHOT_INVALID';
    END IF;
    v_question_id := (v_question->>'id')::uuid;
    v_selected_option := v_answer_map->>v_question_id::text;
    IF v_selected_option IS NULL OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_question->'options') AS option_item(value)
      WHERE value->>'id' = v_selected_option
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRACTICE_ANSWERS_INVALID';
    END IF;
    IF (SELECT count(*)::integer FROM jsonb_array_elements(v_question->'topicIds')) > 10 OR EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(v_question->'topicIds') AS topic(topic_id)
      WHERE topic_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRACTICE_SNAPSHOT_INVALID';
    END IF;
    SELECT q.* INTO v_question_row FROM public.practice_questions q
    WHERE q.workspace_id = v_attempt.workspace_id AND q.test_id = v_attempt.test_id AND q.id = v_question_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRACTICE_SNAPSHOT_INVALID';
    END IF;
    IF v_question->>'position' <> v_question_row.position::text OR v_question->'options' <> v_question_row.options
       OR v_question->'topicIds' <> to_jsonb(v_question_row.topic_ids) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRACTICE_SNAPSHOT_INVALID';
    END IF;
  END LOOP;

  -- The key is not readable to the actor until this state transition is visible in this transaction.
  UPDATE public.practice_attempts
  SET state = 'SUBMITTED', answers = v_answer_map, submitted_at = now()
  WHERE id = v_attempt.id AND user_id = v_actor_id AND state = 'IN_PROGRESS';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRACTICE_ATTEMPT_ALREADY_SUBMITTED';
  END IF;

  FOR v_question IN SELECT value FROM jsonb_array_elements(v_attempt.question_snapshot)
  LOOP
    v_question_id := (v_question->>'id')::uuid;
    v_selected_option := v_answer_map->>v_question_id::text;
    SELECT pa.correct_option_id INTO v_correct_option
    FROM public.practice_answers pa
    WHERE pa.workspace_id = v_attempt.workspace_id AND pa.question_id = v_question_id;
    IF NOT FOUND OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_question->'options') AS option_item(value)
      WHERE value->>'id' = v_correct_option
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PRACTICE_ANSWER_KEY_INVALID';
    END IF;
    IF v_selected_option = v_correct_option THEN v_correct_count := v_correct_count + 1; END IF;
  END LOOP;

  WITH snapshot_questions AS (
    SELECT value AS question, (value->>'id')::uuid AS question_id
    FROM jsonb_array_elements(v_attempt.question_snapshot)
  ), question_topics AS (
    SELECT q.question_id, (topic.value)::uuid AS topic_id,
      CASE WHEN v_answer_map->>q.question_id::text = pa.correct_option_id THEN 1 ELSE 0 END AS is_correct
    FROM snapshot_questions q
    JOIN public.practice_answers pa ON pa.workspace_id = v_attempt.workspace_id AND pa.question_id = q.question_id
    CROSS JOIN LATERAL jsonb_array_elements_text(q.question->'topicIds') AS topic(value)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'topicId', stats.topic_id, 'topicTitle', ct.title, 'correctCount', stats.correct_count,
    'total', stats.total, 'score', round(stats.correct_count::numeric * 100 / stats.total)::integer
  ) ORDER BY ct.title, stats.topic_id), '[]'::jsonb)
  INTO v_feedback
  FROM (
    SELECT topic_id, sum(is_correct)::integer AS correct_count, count(*)::integer AS total
    FROM question_topics GROUP BY topic_id
  ) AS stats
  JOIN public.course_topics ct ON ct.workspace_id = v_attempt.workspace_id AND ct.id = stats.topic_id
    AND ct.publication_status = 'PUBLISHED'
  JOIN public.study_artifacts artifact ON artifact.workspace_id = ct.workspace_id AND artifact.id = v_test.artifact_id
    AND artifact.course_id = ct.course_id;

  v_result := jsonb_build_object(
    'score', round(v_correct_count::numeric * 100 / v_total)::integer,
    'correctCount', v_correct_count, 'total', v_total, 'feedback', v_feedback
  );
  UPDATE public.practice_attempts SET result = v_result WHERE id = v_attempt.id AND user_id = v_actor_id;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_practice_attempt(uuid, jsonb) FROM PUBLIC;

CREATE FUNCTION public.invalidate_document_intelligence(p_document_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_id uuid := NULLIF(current_setting('app.user_id', true), '')::uuid;
  v_workspace_id uuid;
BEGIN
  SELECT d.workspace_id INTO v_workspace_id FROM public.documents d
  WHERE d.id = p_document_id AND d.owner_user_id = v_actor_id;
  IF v_actor_id IS NULL OR v_workspace_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'DOCUMENT_OWNER_REQUIRED';
  END IF;

  UPDATE public.study_artifacts a SET invalidated_at = COALESCE(a.invalidated_at, now())
  WHERE a.invalidated_at IS NULL AND EXISTS (
    SELECT 1 FROM public.study_artifact_sources s
    JOIN public.document_versions v ON v.workspace_id = s.workspace_id AND v.id = s.document_version_id
    WHERE s.workspace_id = v_workspace_id AND s.artifact_id = a.id AND v.document_id = p_document_id
  );
  UPDATE public.practice_tests t SET state = 'ARCHIVED'
  WHERE t.state = 'READY' AND EXISTS (
    SELECT 1 FROM public.study_artifacts a
    JOIN public.study_artifact_sources s ON s.workspace_id = a.workspace_id AND s.artifact_id = a.id
    JOIN public.document_versions v ON v.workspace_id = s.workspace_id AND v.id = s.document_version_id
    WHERE a.workspace_id = t.workspace_id AND a.id = t.artifact_id AND v.document_id = p_document_id
  );
  UPDATE public.assessments a SET state = 'ARCHIVED', revision = revision + 1, updated_at = now()
  WHERE a.state <> 'ARCHIVED' AND EXISTS (
    SELECT 1 FROM public.assessment_generations g
    JOIN public.assessment_generation_sources s ON s.workspace_id = g.workspace_id AND s.generation_id = g.id
    JOIN public.document_versions v ON v.workspace_id = s.workspace_id AND v.id = s.document_version_id
    WHERE g.workspace_id = a.workspace_id AND g.assessment_id = a.id AND v.document_id = p_document_id
  );

  UPDATE public.conversations c SET context_revision = context_revision + 1, updated_at = now()
  WHERE c.workspace_id = v_workspace_id AND (
    EXISTS (SELECT 1 FROM public.conversation_contexts x WHERE x.workspace_id = c.workspace_id AND x.conversation_id = c.id AND x.document_id = p_document_id)
    OR EXISTS (
      SELECT 1 FROM public.messages m JOIN public.message_citations mc ON mc.workspace_id = m.workspace_id AND mc.message_id = m.id
      JOIN public.document_versions v ON v.workspace_id = mc.workspace_id AND v.id = mc.document_version_id
      WHERE m.workspace_id = c.workspace_id AND m.conversation_id = c.id AND v.document_id = p_document_id
    )
  );
  UPDATE public.conversation_summaries s SET invalidated_at = COALESCE(s.invalidated_at, now())
  WHERE s.invalidated_at IS NULL AND s.workspace_id = v_workspace_id AND EXISTS (
    SELECT 1 FROM public.conversations c WHERE c.workspace_id = s.workspace_id AND c.id = s.conversation_id
      AND (EXISTS (SELECT 1 FROM public.conversation_contexts x WHERE x.workspace_id = c.workspace_id AND x.conversation_id = c.id AND x.document_id = p_document_id)
        OR EXISTS (
          SELECT 1 FROM public.messages m JOIN public.message_citations mc ON mc.workspace_id = m.workspace_id AND mc.message_id = m.id
          JOIN public.document_versions v ON v.workspace_id = mc.workspace_id AND v.id = mc.document_version_id
          WHERE m.workspace_id = c.workspace_id AND m.conversation_id = c.id AND v.document_id = p_document_id
        ))
  );
  UPDATE public.messages m SET state = 'FAILED', content = '', citation_count = 0, invalidated_at = now()
  WHERE m.invalidated_at IS NULL AND m.role = 'ASSISTANT' AND m.workspace_id = v_workspace_id AND EXISTS (
    SELECT 1 FROM public.message_citations mc
    JOIN public.document_versions v ON v.workspace_id = mc.workspace_id AND v.id = mc.document_version_id
    WHERE mc.workspace_id = m.workspace_id AND mc.message_id = m.id AND v.document_id = p_document_id
  );
  DELETE FROM public.conversation_contexts x WHERE x.workspace_id = v_workspace_id AND x.document_id = p_document_id;
END;
$$;
REVOKE ALL ON FUNCTION public.invalidate_document_intelligence(uuid) FROM PUBLIC;
