-- N58 / doc 18 §10 — the v2 coaching layer raises the output contract from
-- ≤320 chars / 1–3 sentences to ≤480 chars / 2–4 sentences (hard targets and
-- the multi-factor why first, then at most a clause or two of focus
-- direction). The DB check is the backstop behind the server-side §4
-- post-check + clamp, exactly as in 20260720000001 — only the ceiling moves.
-- No RLS change: policies and write paths are untouched.

alter table public.decision_explanations
  drop constraint decision_explanations_body_check;

alter table public.decision_explanations
  add constraint decision_explanations_body_check
  check (char_length(body) between 1 and 480);
