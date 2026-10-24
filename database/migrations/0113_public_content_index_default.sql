-- Public editorial pages are eligible for Google discovery by default.
-- Existing publications were projected under a former opt-in curation gate.
-- Reconcile those stored flags once at rollout; future projections use publication/rules.ts.
-- Keep explicit editor exclusions, withdrawn/summary-only items, non-editorial signals,
-- and articles without a readable summary out of the index.
UPDATE publications p
SET indexable = (
  p.visibility = 'public'
  AND s.participation_mode = 'editorial'
  AND p.summary IS NOT NULL
  AND p.summary <> ''
  AND p.seo_excluded_at IS NULL
), updated_at = now()
FROM sources s
WHERE s.id = p.source_id
  AND p.indexable IS DISTINCT FROM (
    p.visibility = 'public'
    AND s.participation_mode = 'editorial'
    AND p.summary IS NOT NULL
    AND p.summary <> ''
    AND p.seo_excluded_at IS NULL
  );
