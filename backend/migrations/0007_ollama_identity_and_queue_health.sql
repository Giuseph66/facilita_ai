ALTER TABLE public.ai_connections
  ADD COLUMN account_identity_hash text
    CHECK (account_identity_hash IS NULL OR account_identity_hash ~ '^[0-9a-f]{64}$');

CREATE FUNCTION public.health_queue_metrics()
RETURNS TABLE (queued_count bigint, oldest_queued_age_seconds bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT count(*)::bigint,
         CASE WHEN min(created_at) IS NULL THEN NULL
              ELSE greatest(0, floor(extract(epoch FROM (statement_timestamp() - min(created_at)))))::bigint
         END
  FROM public.jobs
  WHERE state = 'QUEUED'
$$;

REVOKE ALL ON FUNCTION public.health_queue_metrics() FROM PUBLIC;
