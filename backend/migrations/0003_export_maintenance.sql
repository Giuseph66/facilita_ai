-- Technical dispatcher receives only actor IDs; content remains behind actor RLS.
CREATE FUNCTION public.expired_export_actors() RETURNS TABLE(actor_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT DISTINCT e.actor_id FROM public.exports e
  WHERE e.expires_at<=now() AND e.status<>'EXPIRED'
  ORDER BY e.actor_id LIMIT 50;
$$;
REVOKE ALL ON FUNCTION public.expired_export_actors() FROM PUBLIC;
