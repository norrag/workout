-- N62 / doc 19 §12 — raise the coaching-prompt body ceiling from 12,000 to
-- 24,000 characters. The editable prompt (N61) is a living document the owner
-- authors directly: the first stored version already ran 10,968 chars, leaving
-- no room for the §12 payload guidance (source_session + macro) without cutting
-- the owner's own text. The ceiling is a runaway-input backstop behind the
-- server-side zod bound, not a cost control — prompt length still costs input
-- tokens per generation, and nothing here obliges a longer prompt.
-- No RLS change: policies, the activation RPC, and write paths are untouched.

alter table public.coaching_prompts
  drop constraint coaching_prompts_body_check;

alter table public.coaching_prompts
  add constraint coaching_prompts_body_check
  check (char_length(body) between 1 and 24000);
