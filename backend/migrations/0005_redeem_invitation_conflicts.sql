CREATE OR REPLACE FUNCTION public.redeem_class_invitation(p_token_hash text)
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
    ON CONFLICT ON CONSTRAINT workspace_memberships_pkey DO UPDATE SET status = 'ACTIVE';
  INSERT INTO public.workspace_roles (workspace_id, user_id, role)
    VALUES (v_workspace_id, public.app_user_id(), 'STUDENT') ON CONFLICT DO NOTHING;
  INSERT INTO public.enrollments AS e (workspace_id, class_id, user_id, role, status)
    VALUES (v_workspace_id, v_class_id, public.app_user_id(), 'STUDENT', 'ACTIVE')
    ON CONFLICT ON CONSTRAINT enrollments_pkey DO UPDATE
      SET status = 'ACTIVE', joined_at = now(), updated_at = now()
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
REVOKE ALL ON FUNCTION public.redeem_class_invitation(text) FROM PUBLIC;
