-- Break the classes -> courses -> classes RLS policy cycle on class creation.
CREATE FUNCTION public.app_can_create_class(p_workspace_id uuid, p_course_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.courses c
    JOIN public.workspace_roles r
      ON r.workspace_id = c.workspace_id AND r.user_id = public.app_user_id() AND r.role = 'TEACHER'
    JOIN public.workspace_memberships m
      ON m.workspace_id = c.workspace_id AND m.user_id = public.app_user_id() AND m.status = 'ACTIVE'
    WHERE c.workspace_id = p_workspace_id
      AND c.id = p_course_id
      AND c.owner_user_id = public.app_user_id()
  )
$$;
REVOKE ALL ON FUNCTION public.app_can_create_class(uuid, uuid) FROM PUBLIC;

DROP POLICY IF EXISTS classes_teacher_insert ON public.classes;
CREATE POLICY classes_teacher_insert ON public.classes FOR INSERT WITH CHECK (
  teacher_user_id = public.app_user_id()
  AND public.app_can_create_class(workspace_id, course_id)
);
