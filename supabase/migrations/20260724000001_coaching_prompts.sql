-- doc 19 / N60 follow-up — coaching_prompts: the editable, versioned LLM
-- coaching system prompt, tunable from the admin MCP surface WITHOUT a code
-- deploy. Mirrors engine_params exactly (append-only versions, one active row,
-- admin-gated writes) so the tuning loop is familiar: propose an inactive
-- draft → preview it against a real decision (test_llm_explanation) →
-- activate → regenerate (generate_explanations overwrite).
--
-- The code constant COACHING_SYSTEM_PROMPT (src/lib/llm/coaching.ts) stays the
-- PERMANENT fallback: generation resolves the active DB row and falls back to
-- the constant whenever the table is empty or unreadable, so this feature can
-- never take the pipeline down. The table ships EMPTY — the constant (prompt
-- version 3) serves until an admin activates a DB prompt. To keep the doc-19
-- serving cut (serve only prompt_version >= 3) always satisfied, DB versions
-- start ABOVE the code fallback version (proposeCoachingPrompt floors the
-- counter at COACHING_PROMPT_VERSION + 1 = 4).
--
-- Body is bounded generously (the prompt carries few-shot examples); the real
-- guardrail is never the prompt text but the deterministic post-check
-- (postCheckCoaching) + the always-rendered deterministic why — a bad edit
-- degrades to abstention/discard, it can never emit an ungrounded number.

create table public.coaching_prompts (
  id uuid primary key default gen_random_uuid(),
  version int not null unique,
  body text not null check (char_length(body) between 1 and 12000),
  is_active boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.coaching_prompts enable row level security;

-- Internal tuning config: only admins (and the service role, which bypasses
-- RLS during generation) ever read it. Tighter than engine_params — no
-- client-side render path needs the prompt, so default-deny for non-admins.
create policy "coaching_prompts_select_admin" on public.coaching_prompts
  for select using (public.is_admin());
create policy "coaching_prompts_admin_insert" on public.coaching_prompts
  for insert with check (public.is_admin());
create policy "coaching_prompts_admin_update" on public.coaching_prompts
  for update using (public.is_admin());
create policy "coaching_prompts_admin_delete" on public.coaching_prompts
  for delete using (public.is_admin());

-- at most one active prompt, exactly like engine_params
create unique index coaching_prompts_single_active_idx
  on public.coaching_prompts (is_active) where is_active;

create trigger coaching_prompts_updated_at before update on public.coaching_prompts
  for each row execute function public.set_updated_at();

-- Atomic activation (mirrors activate_engine_params, 20260702000005): the
-- deactivate + activate pair runs in ONE transaction so a failure can never
-- leave zero — or two — active rows. SECURITY INVOKER: RLS admin-gates the
-- updates, so a non-admin call touches 0 rows and raises below.
create or replace function public.activate_coaching_prompt(
  p_version int
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.coaching_prompts set is_active = false
  where is_active and version <> p_version;

  update public.coaching_prompts set is_active = true
  where version = p_version;
  if not found then
    raise exception 'coaching_prompts version % not found (or not permitted)', p_version;
  end if;
end;
$$;
revoke execute on function public.activate_coaching_prompt(int) from public;
grant execute on function public.activate_coaching_prompt(int) to authenticated;
