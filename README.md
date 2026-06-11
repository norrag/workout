# WORKOUT

**A serious tool for people who train consistently.**

WORKOUT is a production-quality, PWA-first web application for scientifically tracking workouts through defined training cycles. It plans your training dynamically, learns from your performance and feedback, and progresses you toward your goals using research-backed techniques — periodized macro/meso/microcycles driven by targeted **Reps In Reserve (RIR)** progression.

> Disciplined, useful, quiet, and distinct. Not a lifestyle brand.

---

## What it does

- **Periodized training structure** — Organize training into **macrocycles** (months–years; cut / gain / maintain goals), **mesocycles** (3–6 week planned blocks), and **microcycles** (1-week slices with a target RIR that ramps from 3 RIR down to a peak 0 RIR week, with an optional deload).
- **Dynamic progression engine** — Weights, sets, and reps for each week are computed from your recent performance, per-set and per-workout feedback (pain, pump, fatigue, effort), historical exercise and muscle-group data, and your macrocycle goals.
- **Workout logging** — Fast, minimal-copy tracking screens for weight × reps × sets, with structured feedback prompts after exercises and sessions.
- **Exercise & template library** — Stock exercises for everyone, custom exercises per user, and shareable templates (workout splits grouped by emphasis, days/week, etc.).
- **Deep insights** — Progress scoring and trend analysis across exercises, muscle groups, and cycles.
- **MCP connector** — Connect your training data to the LLM of your choice for tailored analysis, mesocycle planning, template creation, and recommendations grounded in your actual data.
- **Multi-user** — Full auth, per-user data isolation, and controlled sharing of custom content.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind CSS, installable PWA |
| Backend | Supabase (Postgres, Auth, Row Level Security, Edge Functions) |
| Hosting | Vercel |
| AI integration | MCP server exposing user training data + planning tools |
| Repo | GitHub, CI via GitHub Actions |

## Documentation

The build is fully specified before code is written. Start here:

| Doc | Purpose |
|---|---|
| [docs/01-product-spec.md](docs/01-product-spec.md) | Product requirements, user stories, scope |
| [docs/02-architecture.md](docs/02-architecture.md) | System architecture and repo structure |
| [docs/03-data-model.md](docs/03-data-model.md) | Database schema, relationships, RLS strategy |
| [docs/04-feedback-engine.md](docs/04-feedback-engine.md) | The RIR-based progression algorithm and tuning tooling |
| [docs/05-mcp-connector.md](docs/05-mcp-connector.md) | MCP server design: tools, resources, auth |
| [docs/06-design-system.md](docs/06-design-system.md) | Visual language, tokens, components |
| [docs/07-implementation-plan.md](docs/07-implementation-plan.md) | Phased build plan with milestones and acceptance criteria |

## Getting started (once scaffolded)

```bash
npm install
cp .env.example .env.local   # add Supabase keys
npm run dev
```

Local Supabase development uses the Supabase CLI (`supabase start`, migrations in `supabase/migrations/`). See [docs/02-architecture.md](docs/02-architecture.md) for details.

## Status

🏗️ **Planning complete — implementation not yet started.** Follow [docs/07-implementation-plan.md](docs/07-implementation-plan.md) for the build sequence.
