CREATE TABLE IF NOT EXISTS private.test_user_bootstrap_runs (
  bootstrap_key text PRIMARY KEY CHECK (bootstrap_key = 'colegio-demo'),
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_user_ids uuid[] NOT NULL DEFAULT '{}'::uuid[]
);

REVOKE ALL ON TABLE private.test_user_bootstrap_runs FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT SELECT, INSERT ON TABLE private.test_user_bootstrap_runs TO service_role;
