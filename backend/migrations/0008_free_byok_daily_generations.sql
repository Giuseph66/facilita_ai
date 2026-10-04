UPDATE public.plan_entitlements pe
SET value = jsonb_set(pe.value, '{limit}', '5'::jsonb, false)
FROM public.plans p
WHERE p.id = pe.plan_id
  AND p.code = 'FREE'
  AND pe.capability = 'DAILY_GENERATIONS'
  AND pe.value_type = 'LIMIT'
  AND jsonb_typeof(pe.value) = 'object'
  AND pe.value->>'limit' = '0';
