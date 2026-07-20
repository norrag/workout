-- N58 / doc 18 §7 phase 1 — decision_explanations: the stored LLM-generated
-- prescription explanation, keyed 1:1 to the engine decision it explains.
--
-- The decision id IS the cache key (doc 18 §5): a doc-14 recompute or a new
-- advance writes a NEW engine_decisions row, whose explanation is generated
-- with it; the read path always joins a row's LATEST decision, so a stale
-- explanation can never show. No fingerprint participation, no TTLs. The
-- explanation is a display artifact OF a decision, never an engine input.
--
-- Writes are service-role only (the write-site generation hook), exactly like
-- engine_decisions itself: no INSERT/UPDATE/DELETE policy exists for users.
-- Token counts are persisted so the cost audit is a one-line SQL rollup
-- (doc 18 §7.1); model + prompt_version distinguish generations for the v2
-- comparison (doc 18 §10).

create table public.decision_explanations (
  decision_id uuid primary key references public.engine_decisions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- §4 output contract: plain text, clamped to 320 chars server-side before
  -- storing (the DB check is the backstop; the post-check is the gate)
  body text not null check (char_length(body) between 1 and 320),
  model text not null,
  prompt_version int not null,
  tokens_in int not null,
  tokens_out int not null,
  created_at timestamptz not null default now()
);

alter table public.decision_explanations enable row level security;

create policy "decision_explanations_select_own_or_admin" on public.decision_explanations
  for select using (user_id = auth.uid() or public.is_admin());
-- writes happen via service role only (generation hook); no insert policy for users

create index decision_explanations_user_idx
  on public.decision_explanations (user_id, created_at desc);
