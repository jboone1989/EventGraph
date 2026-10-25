-- Dynamic source lifecycle candidates (specs/007-dynamic-source-lifecycle/spec.md): what a
-- discovery channel proposed, the preflight verdict, the trial source it became and the latest
-- promotion decision. `identity` is the same normalized address sourceIdentity() computes for
-- sources, so a candidate can never queue the same feed twice. Nothing reads this table unless a
-- lifecycle function is called; no cron or queue job owns it.
CREATE TABLE source_candidates (
  id text PRIMARY KEY,
  identity text NOT NULL UNIQUE,
  status text NOT NULL,
  origin_channel text NOT NULL,
  origin_note text,
  kind text NOT NULL,
  name text NOT NULL,
  config jsonb NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  rationale text NOT NULL,
  official_low_frequency boolean NOT NULL DEFAULT false,
  manual_hold boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  attached_source_id text,
  trial_started_at timestamptz,
  preflight jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_decision text,
  last_decision_at timestamptz,
  last_score jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
