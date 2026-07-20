# OpenAI API setup — LLM prescription explanations (N58 / doc 18)

The step-by-step for turning on the LLM prescription explanation, written for
a **first-time OpenAI API user**. The code side is fully wired (PR for N58):
every engine decision write fires a small generation call to OpenAI, the
result is post-checked and stored in `decision_explanations`, and the
day-view quick-read strip + MCP `explain_prescription` serve it once you flip
the switch. Until you finish these steps the feature **silently doesn't
exist** — the deterministic quick-read keeps rendering, unchanged.

**What it costs:** ≈ **$0.25/month** at current training volume (doc 18 §8;
~250 decisions/month × ~$0.001 each). A heavy tuning month is ~$0.40. The
budget caps below make an accidental runaway impossible.

**Privacy posture:** the payload is engine-derived numbers only — no names,
no emails, no ids, no free-text notes (doc 18 §3). Requests are sent with
`store: false`, so OpenAI does not retain the exchanges for its dashboard;
nothing about you rides along beyond "someone lifts weights."

---

## 1. One-time OpenAI account setup (dashboard, ~10 minutes)

All of this happens at <https://platform.openai.com> — sign in with the
account you already created.

### 1a. Add billing

- Go to **Settings → Billing** (or <https://platform.openai.com/settings/organization/billing/overview>).
- Add a payment method. Choose **pay as you go** if offered a choice; you do
  NOT need to pre-purchase credits beyond any minimum the dashboard imposes
  (if it asks you to buy starter credits, the $5 minimum is months of runway
  here).
- New accounts sometimes carry trial credits — fine either way.

### 1b. Set spend limits (do not skip)

- **Settings → Limits** (organization budget): set a **monthly budget** of
  **$5** and a **notification threshold** of **$2**. At 20× the expected
  bill, the only way to hit it is a bug — and we want the email before the
  cap, not the cap silently failing requests mid-month.
- These caps are the real kill switch of last resort; the app-side switches
  are in §4.

### 1c. Create a project

- In the top-left project picker: **Create project** → name it `workout`.
- Projects scope keys, spend reporting, and (optionally) model access. Using
  one dedicated project means the usage graphs you'll look at later contain
  ONLY this feature's traffic.

### 1d. Create the API key

- **Settings → API keys** (make sure the `workout` project is selected) →
  **Create new secret key**.
- Name: `workout-vercel` (name it for where it lives, so a future rotation is
  unambiguous).
- **Project**: `workout`. **Permissions**: `Restricted` → grant **Model
  capabilities: Write** only (that's the `/v1/responses` endpoint; everything
  else — assistants, files, fine-tuning — stays off). If the restricted
  editor confuses, `All` on a single-project key is acceptable; restricted is
  just the tighter habit.
- Copy the key **now** (`sk-proj-…`) — it is shown once. Park it in the
  household password manager while you do §2.

### 1e. Sanity-check the key + model id (optional but satisfying)

From any terminal (or skip straight to §3's in-app verification):

```bash
curl -s https://api.openai.com/v1/responses \
  -H "Authorization: Bearer sk-proj-...your-key..." \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-5.6-luna","input":"Say ok.","max_output_tokens":16,"reasoning":{"effort":"none"}}'
```

A JSON response containing `"status": "completed"` and an `output_text` of
"Ok." (or similar) proves key, billing, and model access in one shot. An
`invalid_api_key` / `insufficient_quota` error means §1a/§1d needs another
look.

> **Model note:** the integration calls **`gpt-5.6-luna`** ($1/M input,
> $6/M output, $0.10/M cached input — verified against the official pricing
> page 2026-07-20, matching doc 18 §2). Reasoning effort is pinned to `none`
> in code so reasoning tokens can never inflate output billing. If OpenAI
> ever renames the model, set `OPENAI_EXPLANATION_MODEL` (§2) instead of
> waiting on a deploy.

---

## 2. Wire the key into the app (Vercel + local)

Environment variables are a human-only step (manual-operations.md — the
Vercel MCP can't set them).

### Vercel (dashboard → project `workout` → Settings → Environment Variables)

| Variable | Value | Environments | Notes |
|---|---|---|---|
| `OPENAI_API_KEY` | the `sk-proj-…` key from §1d | **Production only** | Server-only; never `NEXT_PUBLIC_*`. Leaving Preview unset keeps PR preview deploys from generating (and billing) against real decisions. |
| `LLM_EXPLANATIONS` | *(leave unset for now)* | — | Unset (with the key present) = **shadow mode**: explanations generate + store, but **no screen changes** — the §3 voice review happens against stored rows. You'll set it to `on` in §4, or `off` to kill everything. |
| `OPENAI_EXPLANATION_MODEL` | *(leave unset)* | — | Only ever needed if the model id changes upstream. |

Then **redeploy** (any deploy picks the vars up; Deployments → ⋯ → Redeploy
on the latest is fine).

### Local dev (optional)

Add to `.env.local` only if you want generations while developing:

```
OPENAI_API_KEY=sk-proj-...
# LLM_EXPLANATIONS=on   # to see the strip substitution locally
```

Local and production share the hosted DB in this project's dev setup —
locally-generated rows are real rows. That's harmless (same table, same
post-check) but know it's happening.

---

## 3. Verify shadow generation + do the voice review (doc 18 §9 gate)

With the key live and `LLM_EXPLANATIONS` unset, the app is in **shadow
mode**. Generation fires on every decision write: completing a workout
(advance), activating a meso (seed), or any config change that recomputes
open rows.

1. **Produce a batch:** just train — or nudge one decision by editing
   something harmless that triggers a reconcile (e.g. toggle a per-exercise
   increment override and back).
2. **Check rows landed** (Supabase SQL editor, or ask Claude — the Supabase
   MCP can run this):

   ```sql
   select e.name as exercise, de.body, de.model, de.tokens_in, de.tokens_out,
          de.created_at
   from decision_explanations de
   join engine_decisions d on d.id = de.decision_id
   left join exercises e on e.id = d.exercise_id
   order by de.created_at desc
   limit 30;
   ```

3. **Read the batch against the doc 06 voice** (plain, no hype, no
   exclamation marks, lb only, multi-cause why per doc 18 §1). This is the
   §9 gate: the strip does not flip until you're satisfied.
4. **If generation isn't happening:** Vercel → the project's function logs,
   grep `report:llm:explanations` — every failure (API error, post-check
   discard) lands there as a structured line (and in Sentry if `SENTRY_DSN`
   is set). No lines + no rows usually means the env var didn't take
   (re-check §2, redeploy).

A few discards are normal (the §4 post-check rejects any output whose
numbers aren't in the payload — those rows simply fall back to the
deterministic lines). A discard *rate* worth caring about would show up as
many report lines; tell Claude and we tighten the prompt.

---

## 4. Flip it on (and how to turn it off)

- **On:** set `LLM_EXPLANATIONS=on` (Production) → redeploy. The day-view
  quick-read strip now shows the stored explanation as its body (the ask
  line and the ENGINE AUDIT panel stay deterministic forever), and MCP
  `explain_prescription` carries an `explanation` field — the connector
  coach reads the same sentence the app shows.
- **Back to shadow:** remove the var (or set anything other than `on`/`off`).
- **Full kill:** `LLM_EXPLANATIONS=off` (or delete `OPENAI_API_KEY`) →
  redeploy. No generation, no serving; already-stored rows just sit there
  costlessly.

Old prescriptions won't have explanations (no backfill, by design — doc 18
§5); they render the deterministic lines until their next natural recompute
re-decides them.

---

## 5. Ongoing: the cost audit

Token counts are stored on every row, so the monthly bill is one query
(doc 18 §7.1) — run it a month in (doc 18 §7.6), then whenever curious:

```sql
select date_trunc('month', created_at) as month,
       count(*) as generations,
       sum(tokens_in) as tokens_in,
       sum(tokens_out) as tokens_out,
       round((sum(tokens_in) * 1.00 + sum(tokens_out) * 6.00) / 1e6, 4)
         as usd_upper_bound   -- treats all input as cache-missed
from decision_explanations
group by 1 order by 1 desc;
```

Cross-check against the OpenAI dashboard's usage page for the `workout`
project. If the number ever surprises you, the volume half of doc 18 §8 is
the place to re-derive from.

---

## Summary of the human steps

| # | Step | Where |
|---|---|---|
| 1 | Billing + **$5 monthly budget / $2 alert** | platform.openai.com → Settings → Billing / Limits |
| 2 | Project `workout` + restricted API key | platform.openai.com → Settings → API keys |
| 3 | `OPENAI_API_KEY` (Production) → redeploy | Vercel → Settings → Environment Variables |
| 4 | Voice-review the shadow batch (§3 SQL) | Supabase SQL editor / Claude session |
| 5 | `LLM_EXPLANATIONS=on` → redeploy | Vercel → Settings → Environment Variables |
| 6 | Month-one cost rollup (§5 SQL) | Supabase SQL editor / Claude session |
