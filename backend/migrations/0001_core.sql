CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized text NOT NULL UNIQUE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  password_hash text NOT NULL,
  email_verified_at timestamptz,
  default_persona text NOT NULL CHECK (default_persona IN ('STUDENT', 'TEACHER')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DELETION_REQUESTED', 'DISABLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  csrf_token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  authenticated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at <= absolute_expires_at)
);
CREATE INDEX sessions_user_expiry_idx ON sessions(user_id, expires_at);

CREATE TABLE account_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('PASSWORD_RECOVERY')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_tokens_user_purpose_idx ON account_tokens(user_id, purpose, expires_at);

CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('PERSONAL', 'INSTITUTION')),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  acl_version integer NOT NULL DEFAULT 1 CHECK (acl_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, owner_user_id)
);
CREATE UNIQUE INDEX workspaces_personal_owner_uq ON workspaces(owner_user_id) WHERE type = 'PERSONAL' AND owner_user_id IS NOT NULL;

CREATE TABLE workspace_memberships (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX workspace_memberships_user_status_idx ON workspace_memberships(user_id, status);

CREATE TABLE workspace_roles (
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('STUDENT', 'TEACHER')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id, role),
  FOREIGN KEY (workspace_id, user_id) REFERENCES workspace_memberships(workspace_id, user_id) ON DELETE CASCADE
);
CREATE INDEX workspace_roles_user_idx ON workspace_roles(user_id, workspace_id);

CREATE TABLE courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 4000),
  objectives jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(objectives) = 'array'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, owner_user_id) REFERENCES workspace_memberships(workspace_id, user_id) ON DELETE CASCADE
);
CREATE INDEX courses_workspace_owner_idx ON courses(workspace_id, owner_user_id, archived_at);

CREATE TABLE course_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  course_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 240),
  position integer NOT NULL CHECK (position >= 0),
  publication_status text NOT NULL DEFAULT 'DRAFT' CHECK (publication_status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, course_id) REFERENCES courses(workspace_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX course_topics_active_position_uq ON course_topics(workspace_id, course_id, position)
  WHERE publication_status <> 'ARCHIVED';
CREATE INDEX course_topics_course_idx ON course_topics(workspace_id, course_id, position);

CREATE TABLE classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  course_id uuid NOT NULL,
  teacher_user_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  period text NOT NULL DEFAULT '' CHECK (char_length(period) <= 120),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, course_id) REFERENCES courses(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, teacher_user_id) REFERENCES workspace_memberships(workspace_id, user_id) ON DELETE CASCADE
);
CREATE INDEX classes_teacher_idx ON classes(teacher_user_id, archived_at);
CREATE INDEX classes_course_idx ON classes(workspace_id, course_id, archived_at);

CREATE TABLE enrollments (
  workspace_id uuid NOT NULL,
  class_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('STUDENT', 'TEACHER')),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'LEFT', 'REVOKED')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, user_id),
  FOREIGN KEY (workspace_id, class_id) REFERENCES classes(workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX enrollments_user_status_idx ON enrollments(user_id, status, class_id);

CREATE TABLE class_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  class_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  max_uses integer NOT NULL CHECK (max_uses BETWEEN 1 AND 10000),
  used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0 AND used_count <= max_uses),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, class_id) REFERENCES classes(workspace_id, id) ON DELETE CASCADE
);
CREATE INDEX class_invitations_class_idx ON class_invitations(workspace_id, class_id, expires_at);

CREATE TABLE materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  course_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 240),
  kind text NOT NULL CHECK (kind IN ('PDF', 'PPTX')),
  classification text NOT NULL CHECK (classification IN ('ACADEMIC', 'TEACHER_SECRET')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, course_id) REFERENCES courses(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, owner_user_id) REFERENCES workspace_memberships(workspace_id, user_id) ON DELETE CASCADE
);
CREATE INDEX materials_workspace_owner_idx ON materials(workspace_id, owner_user_id, archived_at);
CREATE INDEX materials_course_idx ON materials(workspace_id, course_id, archived_at);

CREATE FUNCTION app_is_material_owner(p_material_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.materials m
    WHERE m.id = p_material_id AND m.owner_user_id = public.app_user_id()
  )
$$;
REVOKE ALL ON FUNCTION app_is_material_owner(uuid) FROM PUBLIC;

CREATE TABLE material_class_releases (
  workspace_id uuid NOT NULL,
  material_id uuid NOT NULL,
  class_id uuid NOT NULL,
  released_at timestamptz,
  revoked_at timestamptz,
  PRIMARY KEY (material_id, class_id),
  FOREIGN KEY (workspace_id, material_id) REFERENCES materials(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, class_id) REFERENCES classes(workspace_id, id) ON DELETE CASCADE,
  CHECK (released_at IS NULL OR revoked_at IS NULL OR revoked_at >= released_at)
);
CREATE INDEX material_releases_class_idx ON material_class_releases(workspace_id, class_id, revoked_at);

CREATE FUNCTION prevent_teacher_secret_release() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM materials WHERE workspace_id = NEW.workspace_id AND id = NEW.material_id AND classification = 'TEACHER_SECRET') THEN
    RAISE EXCEPTION 'teacher secret materials cannot be released' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER material_release_classification_guard
BEFORE INSERT OR UPDATE ON material_class_releases
FOR EACH ROW EXECUTE FUNCTION prevent_teacher_secret_release();

CREATE TABLE billing_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE')),
  catalog_version integer NOT NULL CHECK (catalog_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, catalog_version)
);

CREATE TABLE plan_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  interval text NOT NULL CHECK (interval IN ('month', 'year')),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);
CREATE INDEX plan_prices_active_idx ON plan_prices(plan_id, valid_from, valid_until);

CREATE TABLE plan_entitlements (
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  capability text NOT NULL,
  value_type text NOT NULL CHECK (value_type IN ('BOOLEAN', 'LIMIT', 'CONFIG')),
  value jsonb NOT NULL,
  PRIMARY KEY (plan_id, capability),
  CHECK ((value_type = 'BOOLEAN' AND jsonb_typeof(value) = 'boolean') OR value_type <> 'BOOLEAN'),
  CHECK ((value_type = 'LIMIT' AND jsonb_typeof(value) = 'object' AND (value->>'limit') ~ '^[0-9]+$') OR value_type <> 'LIMIT')
);

CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES billing_accounts(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  state text NOT NULL CHECK (state IN ('ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED')),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  provider_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end > period_start)
);
CREATE INDEX subscriptions_account_state_idx ON subscriptions(account_id, state, period_end);

CREATE TABLE usage_counters (
  account_id uuid NOT NULL REFERENCES billing_accounts(id) ON DELETE CASCADE,
  metric text NOT NULL,
  period_start timestamptz NOT NULL,
  used bigint NOT NULL DEFAULT 0 CHECK (used >= 0),
  reserved bigint NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  PRIMARY KEY (account_id, metric, period_start)
);

CREATE TABLE usage_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id text NOT NULL,
  account_id uuid NOT NULL REFERENCES billing_accounts(id) ON DELETE CASCADE,
  metric text NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  state text NOT NULL CHECK (state IN ('RESERVED', 'COMMITTED', 'RELEASED', 'EXPIRED')),
  period_start timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, metric)
);
CREATE INDEX usage_reservations_counter_idx ON usage_reservations(account_id, metric, state, expires_at);

CREATE TABLE usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id text NOT NULL,
  account_id uuid NOT NULL REFERENCES billing_accounts(id) ON DELETE CASCADE,
  metric text NOT NULL,
  delta bigint NOT NULL,
  reason text NOT NULL CHECK (reason IN ('COMMIT', 'RELEASE', 'EXPIRE', 'ADJUSTMENT')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, metric, reason)
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text,
  resource_id uuid,
  workspace_id uuid,
  request_id text,
  job_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_actor_created_idx ON audit_events(actor_id, created_at DESC);
CREATE INDEX audit_events_resource_idx ON audit_events(resource_type, resource_id, created_at DESC);

CREATE TABLE privacy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('EXPORT', 'DELETE_ACCOUNT')),
  state text NOT NULL CHECK (state IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  result_storage_key text,
  expires_at timestamptz,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_code text
);
CREATE INDEX privacy_requests_user_requested_idx ON privacy_requests(user_id, requested_at DESC);

-- The outbox contains only deletion routing data; private request details stay in privacy_requests.
CREATE TABLE privacy_outbox (
  request_id uuid PRIMARY KEY REFERENCES privacy_requests(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  workspace_id uuid,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX privacy_outbox_claim_idx ON privacy_outbox(claimed_at, created_at);

CREATE TABLE privacy_export_cleanup (
  request_id uuid PRIMARY KEY REFERENCES privacy_requests(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  storage_key text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX privacy_export_cleanup_claim_idx ON privacy_export_cleanup(expires_at, claimed_at);

CREATE TABLE rate_limit_buckets (
  bucket_key text NOT NULL,
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts > 0),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (bucket_key, window_start)
);
CREATE INDEX rate_limit_buckets_expiry_idx ON rate_limit_buckets(expires_at);

-- A user's personal workspace is the boundary for profile personas and the default payer.
ALTER TABLE billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_accounts_owner ON billing_accounts
  USING (owner_user_id = app_user_id()) WITH CHECK (owner_user_id = app_user_id());

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;
CREATE POLICY workspaces_member_read ON workspaces FOR SELECT
  USING (owner_user_id = app_user_id() OR EXISTS (
    SELECT 1 FROM workspace_memberships m WHERE m.workspace_id = id AND m.user_id = app_user_id() AND m.status = 'ACTIVE'
  ));
CREATE POLICY workspaces_owner_write ON workspaces FOR ALL
  USING (owner_user_id = app_user_id()) WITH CHECK (owner_user_id = app_user_id());

ALTER TABLE workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY memberships_self_read ON workspace_memberships FOR SELECT USING (user_id = app_user_id());
CREATE POLICY memberships_personal_insert ON workspace_memberships FOR INSERT WITH CHECK (
  user_id = app_user_id() AND EXISTS (
    SELECT 1 FROM workspaces w WHERE w.id = workspace_id AND w.type = 'PERSONAL' AND w.owner_user_id = app_user_id()
  )
);

ALTER TABLE workspace_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_roles FORCE ROW LEVEL SECURITY;
CREATE POLICY roles_self_read ON workspace_roles FOR SELECT USING (user_id = app_user_id());
CREATE POLICY roles_personal_insert ON workspace_roles FOR INSERT WITH CHECK (
  user_id = app_user_id() AND EXISTS (
    SELECT 1 FROM workspaces w WHERE w.id = workspace_id AND w.type = 'PERSONAL' AND w.owner_user_id = app_user_id()
  )
);
CREATE POLICY roles_personal_delete ON workspace_roles FOR DELETE USING (
  user_id = app_user_id() AND EXISTS (
    SELECT 1 FROM workspaces w WHERE w.id = workspace_id AND w.type = 'PERSONAL' AND w.owner_user_id = app_user_id()
  )
);

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses FORCE ROW LEVEL SECURITY;
CREATE POLICY courses_authorized_read ON courses FOR SELECT USING (
  owner_user_id = app_user_id() OR EXISTS (
    SELECT 1 FROM classes c
    WHERE c.workspace_id = courses.workspace_id AND c.course_id = courses.id AND c.archived_at IS NULL
      AND (c.teacher_user_id = app_user_id() OR EXISTS (
        SELECT 1 FROM enrollments e WHERE e.workspace_id = c.workspace_id AND e.class_id = c.id
          AND e.user_id = app_user_id() AND e.status = 'ACTIVE'
      ))
  )
);
CREATE POLICY courses_owner_insert ON courses FOR INSERT WITH CHECK (
  owner_user_id = app_user_id() AND EXISTS (
    SELECT 1 FROM workspace_memberships m WHERE m.workspace_id = courses.workspace_id
      AND m.user_id = app_user_id() AND m.status = 'ACTIVE'
  )
);
CREATE POLICY courses_owner_update ON courses FOR UPDATE
  USING (owner_user_id = app_user_id()) WITH CHECK (owner_user_id = app_user_id());
CREATE POLICY courses_owner_delete ON courses FOR DELETE USING (owner_user_id = app_user_id());

ALTER TABLE course_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_topics FORCE ROW LEVEL SECURITY;
CREATE POLICY course_topics_authorized_read ON course_topics FOR SELECT USING (
  EXISTS (SELECT 1 FROM courses c WHERE c.workspace_id = course_topics.workspace_id AND c.id = course_topics.course_id)
);
CREATE POLICY course_topics_owner_write ON course_topics FOR ALL USING (
  EXISTS (SELECT 1 FROM courses c WHERE c.workspace_id = course_topics.workspace_id AND c.id = course_topics.course_id AND c.owner_user_id = app_user_id())
) WITH CHECK (
  EXISTS (SELECT 1 FROM courses c WHERE c.workspace_id = course_topics.workspace_id AND c.id = course_topics.course_id AND c.owner_user_id = app_user_id())
);

ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes FORCE ROW LEVEL SECURITY;
CREATE POLICY classes_authorized_read ON classes FOR SELECT USING (
  teacher_user_id = app_user_id() OR EXISTS (
    SELECT 1 FROM enrollments e WHERE e.workspace_id = classes.workspace_id AND e.class_id = classes.id
      AND e.user_id = app_user_id() AND e.status = 'ACTIVE'
  )
);
CREATE POLICY classes_teacher_insert ON classes FOR INSERT WITH CHECK (
  teacher_user_id = app_user_id() AND EXISTS (
    SELECT 1 FROM courses c WHERE c.workspace_id = classes.workspace_id AND c.id = classes.course_id AND c.owner_user_id = app_user_id()
  )
);
CREATE POLICY classes_teacher_update ON classes FOR UPDATE USING (teacher_user_id = app_user_id()) WITH CHECK (teacher_user_id = app_user_id());
CREATE POLICY classes_teacher_delete ON classes FOR DELETE USING (teacher_user_id = app_user_id());

CREATE FUNCTION app_is_class_teacher(p_class_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id = p_class_id AND c.teacher_user_id = public.app_user_id()
  )
$$;
REVOKE ALL ON FUNCTION app_is_class_teacher(uuid) FROM PUBLIC;

CREATE FUNCTION bump_workspace_acl(p_workspace_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_memberships m
    WHERE m.workspace_id = p_workspace_id AND m.user_id = public.app_user_id() AND m.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'workspace membership required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.workspaces SET acl_version = acl_version + 1 WHERE id = p_workspace_id;
END
$$;
REVOKE ALL ON FUNCTION bump_workspace_acl(uuid) FROM PUBLIC;

CREATE FUNCTION redeem_class_invitation(p_token_hash text)
RETURNS TABLE (workspace_id uuid, class_id uuid, user_id uuid, role text, status text, joined_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  invitation_id uuid;
  v_workspace_id uuid;
  v_class_id uuid;
  v_user_id uuid;
  v_role text;
  v_status text;
  v_joined_at timestamptz;
  v_existing_status text;
  v_existing_role text;
  v_existing_joined_at timestamptz;
BEGIN
  SELECT i.id, i.workspace_id, i.class_id
    INTO invitation_id, v_workspace_id, v_class_id
    FROM public.class_invitations i
    JOIN public.classes c ON c.workspace_id = i.workspace_id AND c.id = i.class_id
   WHERE i.token_hash = p_token_hash AND i.revoked_at IS NULL AND i.expires_at > now()
     AND i.used_count < i.max_uses AND c.archived_at IS NULL
  FOR UPDATE OF i;
  IF invitation_id IS NULL THEN RETURN; END IF;
  SELECT e.role, e.status, e.joined_at
    INTO v_existing_role, v_existing_status, v_existing_joined_at
    FROM public.enrollments e
   WHERE e.workspace_id = v_workspace_id AND e.class_id = v_class_id AND e.user_id = public.app_user_id();
  IF FOUND AND v_existing_status = 'ACTIVE' THEN
    workspace_id := v_workspace_id;
    class_id := v_class_id;
    user_id := public.app_user_id();
    role := v_existing_role;
    status := v_existing_status;
    joined_at := v_existing_joined_at;
    RETURN NEXT;
    RETURN;
  END IF;
  IF FOUND AND v_existing_status = 'REVOKED' THEN RETURN; END IF;
  UPDATE public.class_invitations SET used_count = used_count + 1 WHERE id = invitation_id;
  INSERT INTO public.workspace_memberships (workspace_id, user_id, status)
    VALUES (v_workspace_id, public.app_user_id(), 'ACTIVE')
    ON CONFLICT (workspace_id, user_id) DO UPDATE SET status = 'ACTIVE';
  INSERT INTO public.workspace_roles (workspace_id, user_id, role)
    VALUES (v_workspace_id, public.app_user_id(), 'STUDENT') ON CONFLICT DO NOTHING;
  INSERT INTO public.enrollments AS e (workspace_id, class_id, user_id, role, status)
    VALUES (v_workspace_id, v_class_id, public.app_user_id(), 'STUDENT', 'ACTIVE')
    ON CONFLICT (class_id, user_id) DO UPDATE SET status = 'ACTIVE', joined_at = now(), updated_at = now()
      WHERE e.status = 'LEFT'
    RETURNING e.user_id, e.role, e.status, e.joined_at
    INTO v_user_id, v_role, v_status, v_joined_at;
  IF v_user_id IS NULL THEN RETURN; END IF;
  UPDATE public.workspaces SET acl_version = acl_version + 1 WHERE id = v_workspace_id;
  workspace_id := v_workspace_id;
  class_id := v_class_id;
  user_id := v_user_id;
  role := v_role;
  status := v_status;
  joined_at := v_joined_at;
  RETURN NEXT;
END
$$;
REVOKE ALL ON FUNCTION redeem_class_invitation(text) FROM PUBLIC;

CREATE POLICY enrollments_teacher_read ON enrollments FOR SELECT USING (app_is_class_teacher(class_id));
CREATE POLICY enrollments_teacher_update ON enrollments FOR UPDATE
  USING (app_is_class_teacher(class_id)) WITH CHECK (app_is_class_teacher(class_id));
CREATE POLICY enrollments_teacher_delete ON enrollments FOR DELETE USING (app_is_class_teacher(class_id));
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments FORCE ROW LEVEL SECURITY;
CREATE POLICY enrollments_self_read ON enrollments FOR SELECT USING (user_id = app_user_id());
CREATE POLICY enrollments_self_update ON enrollments FOR UPDATE
  USING (user_id = app_user_id() AND role = 'STUDENT' AND status = 'ACTIVE')
  WITH CHECK (user_id = app_user_id() AND role = 'STUDENT' AND status = 'LEFT');

ALTER TABLE class_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY invitations_teacher_access ON class_invitations FOR ALL USING (
  EXISTS (SELECT 1 FROM classes c WHERE c.workspace_id = class_invitations.workspace_id AND c.id = class_invitations.class_id AND c.teacher_user_id = app_user_id())
) WITH CHECK (
  EXISTS (SELECT 1 FROM classes c WHERE c.workspace_id = class_invitations.workspace_id AND c.id = class_invitations.class_id AND c.teacher_user_id = app_user_id())
);

ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials FORCE ROW LEVEL SECURITY;
CREATE POLICY materials_authorized_read ON materials FOR SELECT USING (
  owner_user_id = app_user_id() OR (classification = 'ACADEMIC' AND EXISTS (
    SELECT 1 FROM material_class_releases r JOIN classes c ON c.workspace_id = r.workspace_id AND c.id = r.class_id
    JOIN enrollments e ON e.workspace_id = c.workspace_id AND e.class_id = c.id
    WHERE r.workspace_id = materials.workspace_id AND r.material_id = materials.id
      AND r.released_at IS NOT NULL AND r.revoked_at IS NULL AND c.archived_at IS NULL
      AND e.user_id = app_user_id() AND e.status = 'ACTIVE'
  ))
);
CREATE POLICY materials_owner_insert ON materials FOR INSERT WITH CHECK (
  owner_user_id = app_user_id() AND EXISTS (
    SELECT 1 FROM courses c WHERE c.workspace_id = materials.workspace_id AND c.id = materials.course_id AND c.owner_user_id = app_user_id()
  )
);
CREATE POLICY materials_owner_update ON materials FOR UPDATE USING (owner_user_id = app_user_id()) WITH CHECK (owner_user_id = app_user_id());
CREATE POLICY materials_owner_delete ON materials FOR DELETE USING (owner_user_id = app_user_id());

ALTER TABLE material_class_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_class_releases FORCE ROW LEVEL SECURITY;
CREATE POLICY releases_authorized_read ON material_class_releases FOR SELECT USING (
  EXISTS (SELECT 1 FROM classes c WHERE c.workspace_id = material_class_releases.workspace_id AND c.id = material_class_releases.class_id AND c.teacher_user_id = app_user_id())
  OR EXISTS (SELECT 1 FROM enrollments e WHERE e.workspace_id = material_class_releases.workspace_id AND e.class_id = material_class_releases.class_id AND e.user_id = app_user_id() AND e.status = 'ACTIVE')
);
CREATE POLICY releases_teacher_insert ON material_class_releases FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM classes c WHERE c.workspace_id = material_class_releases.workspace_id AND c.id = material_class_releases.class_id AND c.teacher_user_id = app_user_id())
  AND app_is_material_owner(material_id)
);
CREATE POLICY releases_teacher_update ON material_class_releases FOR UPDATE USING (
  EXISTS (SELECT 1 FROM classes c WHERE c.workspace_id = material_class_releases.workspace_id AND c.id = material_class_releases.class_id AND c.teacher_user_id = app_user_id())
  AND app_is_material_owner(material_id)
) WITH CHECK (
  EXISTS (SELECT 1 FROM classes c WHERE c.workspace_id = material_class_releases.workspace_id AND c.id = material_class_releases.class_id AND c.teacher_user_id = app_user_id())
  AND app_is_material_owner(material_id)
);
CREATE POLICY releases_teacher_delete ON material_class_releases FOR DELETE USING (
  EXISTS (SELECT 1 FROM classes c WHERE c.workspace_id = material_class_releases.workspace_id AND c.id = material_class_releases.class_id AND c.teacher_user_id = app_user_id())
  AND app_is_material_owner(material_id)
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_account_owner ON subscriptions FOR SELECT USING (
  EXISTS (SELECT 1 FROM billing_accounts b WHERE b.id = subscriptions.account_id AND b.owner_user_id = app_user_id())
);
CREATE POLICY subscriptions_account_insert ON subscriptions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM billing_accounts b WHERE b.id = subscriptions.account_id AND b.owner_user_id = app_user_id())
);
CREATE POLICY subscriptions_account_update ON subscriptions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM billing_accounts b WHERE b.id = subscriptions.account_id AND b.owner_user_id = app_user_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM billing_accounts b WHERE b.id = subscriptions.account_id AND b.owner_user_id = app_user_id()));
CREATE POLICY subscriptions_account_delete ON subscriptions FOR DELETE USING (
  EXISTS (SELECT 1 FROM billing_accounts b WHERE b.id = subscriptions.account_id AND b.owner_user_id = app_user_id())
);
ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_counters FORCE ROW LEVEL SECURITY;
CREATE POLICY usage_counters_account_owner ON usage_counters FOR ALL USING (
  EXISTS (SELECT 1 FROM billing_accounts b WHERE b.id = usage_counters.account_id AND b.owner_user_id = app_user_id())
) WITH CHECK (
  EXISTS (SELECT 1 FROM billing_accounts b WHERE b.id = usage_counters.account_id AND b.owner_user_id = app_user_id())
);
ALTER TABLE usage_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_reservations FORCE ROW LEVEL SECURITY;
CREATE POLICY usage_reservations_account_owner ON usage_reservations FOR ALL USING (
  EXISTS (SELECT 1 FROM billing_accounts b WHERE b.id = usage_reservations.account_id AND b.owner_user_id = app_user_id())
) WITH CHECK (
  EXISTS (SELECT 1 FROM billing_accounts b WHERE b.id = usage_reservations.account_id AND b.owner_user_id = app_user_id())
);
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events FORCE ROW LEVEL SECURITY;
CREATE POLICY usage_events_account_owner ON usage_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM billing_accounts b WHERE b.id = usage_events.account_id AND b.owner_user_id = app_user_id())
);
CREATE POLICY usage_events_account_insert ON usage_events FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM billing_accounts b WHERE b.id = usage_events.account_id AND b.owner_user_id = app_user_id())
);
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_events_actor_access ON audit_events FOR ALL USING (actor_id = app_user_id()) WITH CHECK (actor_id = app_user_id());
ALTER TABLE privacy_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY privacy_requests_owner_access ON privacy_requests FOR ALL USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());

INSERT INTO plans (id, code, name, status, catalog_version) VALUES
  ('00000000-0000-4000-8000-000000000001', 'FREE', 'Livre', 'ACTIVE', 1),
  ('00000000-0000-4000-8000-000000000002', 'BYOK', 'IA Própria', 'ACTIVE', 1),
  ('00000000-0000-4000-8000-000000000003', 'PREMIUM', 'Completo', 'ACTIVE', 1),
  ('00000000-0000-4000-8000-000000000004', 'TEACHER_PRO', 'Professor Pro', 'ACTIVE', 1)
ON CONFLICT (code, catalog_version) DO NOTHING;

INSERT INTO plan_prices (plan_id, currency, interval, amount, valid_from) VALUES
  ('00000000-0000-4000-8000-000000000001', 'BRL', 'month', 0, now())
ON CONFLICT DO NOTHING;

INSERT INTO plan_entitlements (plan_id, capability, value_type, value) VALUES
  ('00000000-0000-4000-8000-000000000001', 'AI_BYOK_ACCESS', 'BOOLEAN', 'true'),
  ('00000000-0000-4000-8000-000000000001', 'AI_PLATFORM_ACCESS', 'BOOLEAN', 'false'),
  ('00000000-0000-4000-8000-000000000001', 'RAG_ACCESS', 'BOOLEAN', 'true'),
  ('00000000-0000-4000-8000-000000000001', 'ASSESSMENT_GENERATION', 'BOOLEAN', 'false'),
  ('00000000-0000-4000-8000-000000000001', 'ASSESSMENT_VARIANTS', 'BOOLEAN', 'false'),
  ('00000000-0000-4000-8000-000000000001', 'PDF_EXPORT', 'BOOLEAN', 'true'),
  ('00000000-0000-4000-8000-000000000001', 'DOCX_EXPORT', 'BOOLEAN', 'false'),
  ('00000000-0000-4000-8000-000000000001', 'MATERIALS_CREATE', 'BOOLEAN', 'true'),
  ('00000000-0000-4000-8000-000000000001', 'PILOT_LIMITS', 'CONFIG', '{"commerciallyAvailable":false,"source":"technical-pilot"}'),
  ('00000000-0000-4000-8000-000000000001', 'MAX_DOCUMENTS', 'LIMIT', '{"limit":5,"period":"lifetime"}'),
  ('00000000-0000-4000-8000-000000000001', 'MAX_STORAGE_BYTES', 'LIMIT', '{"limit":50000000,"period":"lifetime"}'),
  ('00000000-0000-4000-8000-000000000001', 'MAX_CLASSES', 'LIMIT', '{"limit":1,"period":"lifetime"}'),
  ('00000000-0000-4000-8000-000000000001', 'DAILY_STUDY_SESSIONS', 'LIMIT', '{"limit":10,"period":"day"}'),
  ('00000000-0000-4000-8000-000000000001', 'DAILY_GENERATIONS', 'LIMIT', '{"limit":0,"period":"day"}'),
  ('00000000-0000-4000-8000-000000000001', 'MAX_CONCURRENT_AI_JOBS', 'LIMIT', '{"limit":1,"period":"concurrent"}'),
  ('00000000-0000-4000-8000-000000000001', 'documents.bytes.monthly', 'LIMIT', '{"limit":20000000,"period":"month"}'),
  ('00000000-0000-4000-8000-000000000002', 'AI_BYOK_ACCESS', 'BOOLEAN', 'true'),
  ('00000000-0000-4000-8000-000000000002', 'AI_PLATFORM_ACCESS', 'BOOLEAN', 'false'),
  ('00000000-0000-4000-8000-000000000002', 'RAG_ACCESS', 'BOOLEAN', 'true'),
  ('00000000-0000-4000-8000-000000000002', 'ASSESSMENT_GENERATION', 'BOOLEAN', 'true'),
  ('00000000-0000-4000-8000-000000000002', 'ASSESSMENT_VARIANTS', 'BOOLEAN', 'false'),
  ('00000000-0000-4000-8000-000000000002', 'PDF_EXPORT', 'BOOLEAN', 'true'),
  ('00000000-0000-4000-8000-000000000002', 'DOCX_EXPORT', 'BOOLEAN', 'false'),
  ('00000000-0000-4000-8000-000000000002', 'MATERIALS_CREATE', 'BOOLEAN', 'true'),
  ('00000000-0000-4000-8000-000000000002', 'PILOT_LIMITS', 'CONFIG', '{"commerciallyAvailable":false,"source":"technical-pilot"}'),
  ('00000000-0000-4000-8000-000000000002', 'MAX_DOCUMENTS', 'LIMIT', '{"limit":50,"period":"lifetime"}'),
  ('00000000-0000-4000-8000-000000000002', 'MAX_STORAGE_BYTES', 'LIMIT', '{"limit":250000000,"period":"lifetime"}'),
  ('00000000-0000-4000-8000-000000000002', 'MAX_CLASSES', 'LIMIT', '{"limit":5,"period":"lifetime"}'),
  ('00000000-0000-4000-8000-000000000002', 'DAILY_STUDY_SESSIONS', 'LIMIT', '{"limit":100,"period":"day"}'),
  ('00000000-0000-4000-8000-000000000002', 'DAILY_GENERATIONS', 'LIMIT', '{"limit":25,"period":"day"}'),
  ('00000000-0000-4000-8000-000000000002', 'MAX_CONCURRENT_AI_JOBS', 'LIMIT', '{"limit":1,"period":"concurrent"}'),
  ('00000000-0000-4000-8000-000000000002', 'documents.bytes.monthly', 'LIMIT', '{"limit":100000000,"period":"month"}'),
  ('00000000-0000-4000-8000-000000000003', 'AI_BYOK_ACCESS', 'BOOLEAN', 'true'),
  ('00000000-0000-4000-8000-000000000003', 'AI_PLATFORM_ACCESS', 'BOOLEAN', 'false'),
  ('00000000-0000-4000-8000-000000000003', 'RAG_ACCESS', 'BOOLEAN', 'true'),
  ('00000000-0000-4000-8000-000000000003', 'ASSESSMENT_GENERATION', 'BOOLEAN', 'true'),
  ('00000000-0000-4000-8000-000000000003', 'ASSESSMENT_VARIANTS', 'BOOLEAN', 'true'),
  ('00000000-0000-4000-8000-000000000003', 'PDF_EXPORT', 'BOOLEAN', 'true'),
  ('00000000-0000-4000-8000-000000000003', 'DOCX_EXPORT', 'BOOLEAN', 'false'),
  ('00000000-0000-4000-8000-000000000003', 'MATERIALS_CREATE', 'BOOLEAN', 'true'),
  ('00000000-0000-4000-8000-000000000003', 'PILOT_LIMITS', 'CONFIG', '{"commerciallyAvailable":false,"source":"technical-pilot"}'),
  ('00000000-0000-4000-8000-000000000003', 'MAX_DOCUMENTS', 'LIMIT', '{"limit":200,"period":"lifetime"}'),
  ('00000000-0000-4000-8000-000000000003', 'MAX_STORAGE_BYTES', 'LIMIT', '{"limit":2000000000,"period":"lifetime"}'),
  ('00000000-0000-4000-8000-000000000003', 'MAX_CLASSES', 'LIMIT', '{"limit":10,"period":"lifetime"}'),
  ('00000000-0000-4000-8000-000000000003', 'DAILY_STUDY_SESSIONS', 'LIMIT', '{"limit":500,"period":"day"}'),
  ('00000000-0000-4000-8000-000000000003', 'DAILY_GENERATIONS', 'LIMIT', '{"limit":100,"period":"day"}'),
  ('00000000-0000-4000-8000-000000000003', 'MAX_CONCURRENT_AI_JOBS', 'LIMIT', '{"limit":2,"period":"concurrent"}'),
  ('00000000-0000-4000-8000-000000000003', 'documents.bytes.monthly', 'LIMIT', '{"limit":500000000,"period":"month"}'),
  ('00000000-0000-4000-8000-000000000004', 'AI_BYOK_ACCESS', 'BOOLEAN', 'true'),
  ('00000000-0000-4000-8000-000000000004', 'AI_PLATFORM_ACCESS', 'BOOLEAN', 'false'),
  ('00000000-0000-4000-8000-000000000004', 'RAG_ACCESS', 'BOOLEAN', 'true'),
  ('00000000-0000-4000-8000-000000000004', 'ASSESSMENT_GENERATION', 'BOOLEAN', 'true'),
  ('00000000-0000-4000-8000-000000000004', 'ASSESSMENT_VARIANTS', 'BOOLEAN', 'true'),
  ('00000000-0000-4000-8000-000000000004', 'PDF_EXPORT', 'BOOLEAN', 'true'),
  ('00000000-0000-4000-8000-000000000004', 'DOCX_EXPORT', 'BOOLEAN', 'false'),
  ('00000000-0000-4000-8000-000000000004', 'MATERIALS_CREATE', 'BOOLEAN', 'true'),
  ('00000000-0000-4000-8000-000000000004', 'PILOT_LIMITS', 'CONFIG', '{"commerciallyAvailable":false,"source":"technical-pilot"}'),
  ('00000000-0000-4000-8000-000000000004', 'MAX_DOCUMENTS', 'LIMIT', '{"limit":500,"period":"lifetime"}'),
  ('00000000-0000-4000-8000-000000000004', 'MAX_STORAGE_BYTES', 'LIMIT', '{"limit":10000000000,"period":"lifetime"}'),
  ('00000000-0000-4000-8000-000000000004', 'MAX_CLASSES', 'LIMIT', '{"limit":50,"period":"lifetime"}'),
  ('00000000-0000-4000-8000-000000000004', 'DAILY_STUDY_SESSIONS', 'LIMIT', '{"limit":1000,"period":"day"}'),
  ('00000000-0000-4000-8000-000000000004', 'DAILY_GENERATIONS', 'LIMIT', '{"limit":500,"period":"day"}'),
  ('00000000-0000-4000-8000-000000000004', 'MAX_CONCURRENT_AI_JOBS', 'LIMIT', '{"limit":3,"period":"concurrent"}'),
  ('00000000-0000-4000-8000-000000000004', 'documents.bytes.monthly', 'LIMIT', '{"limit":1000000000,"period":"month"}')
ON CONFLICT (plan_id, capability) DO NOTHING;
