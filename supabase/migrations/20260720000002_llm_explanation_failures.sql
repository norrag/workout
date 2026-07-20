-- N58 follow-up (2026-07-20 testing session) — llm_explanation_failures: a
-- durable record of every failed LLM explanation generation attempt.
--
-- Why: the generation hook is fire-and-forget (doc 18 §5) and its only failure
-- surface was the R20 console/Sentry funnel — i.e. Vercel function logs. The
-- first live test (workout completion → 8 generation attempts) failed with an
-- upstream model error and left NOTHING queryable: no rows, no tokens, no way
-- to see the error from a Claude session or the SQL editor. Failures now land
-- here (best-effort, service-written, alongside the existing R20 report) so
-- "why is decision_explanations empty?" is a one-line query, and the
-- `get_llm_explanation_status` admin MCP tool can answer it directly.
--
-- Posture mirrors decision_explanations: owner-or-admin SELECT, service-role
-- only writes. Rows are diagnostics, not history — pruning old rows via SQL
-- is fine (no hard-rule-5 concern).

create table public.llm_explanation_failures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- nullable: a burst-level failure (e.g. the decision fetch itself) has no
  -- single decision; per-decision failures carry theirs
  decision_id uuid references public.engine_decisions (id) on delete cascade,
  -- where in the pipeline it died: the burst wrapper, one decision's
  -- generation (API error), or the §4 post-check discard
  stage text not null check (stage in ('burst', 'generate', 'post_check')),
  error text not null check (char_length(error) between 1 and 2000),
  -- structured extras (model id, discard reason, ...) — never payload text
  context jsonb,
  created_at timestamptz not null default now()
);

alter table public.llm_explanation_failures enable row level security;

create policy "llm_explanation_failures_select_own_or_admin" on public.llm_explanation_failures
  for select using (user_id = auth.uid() or public.is_admin());
-- writes happen via service role only (the generation hook); no insert policy for users

create index llm_explanation_failures_user_idx
  on public.llm_explanation_failures (user_id, created_at desc);
create index llm_explanation_failures_decision_idx
  on public.llm_explanation_failures (decision_id);
