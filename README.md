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
- **In-app User Guide** — 21 chapters covering every screen, every term, and plain-language explanations of the machinery that produces the numbers. Reachable from **More → Guide**, searchable, and readable by a connected assistant through the same section index.
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

Two audiences, two places.

**Using the app** — the **User Guide**, in the app itself under **More → Guide**:
21 chapters split into short, independently addressable sections, with a search
over all of them. Chapter 18 (*Training with AI*) covers the connector, and
`docs/22-user-manual.md` is the spec behind it.

**Building the app** — the build is specified before code is written:

| Doc | Purpose |
|---|---|
| [docs/01-product-spec.md](docs/01-product-spec.md) | Product requirements, user stories, scope |
| [docs/02-architecture.md](docs/02-architecture.md) | System architecture and repo structure |
| [docs/03-data-model.md](docs/03-data-model.md) | Database schema, relationships, RLS strategy |
| [docs/04-feedback-engine.md](docs/04-feedback-engine.md) | The RIR-based progression algorithm and tuning tooling |
| [docs/05-mcp-connector.md](docs/05-mcp-connector.md) | MCP server design: tools, resources, auth |
| [docs/06-design-system.md](docs/06-design-system.md) | Visual language, tokens, components |
| [docs/07-implementation-plan.md](docs/07-implementation-plan.md) | Phased build plan with milestones and acceptance criteria |
| [docs/08-design-decisions.md](docs/08-design-decisions.md) · [docs/09-design-changelog.md](docs/09-design-changelog.md) | The design baseline and its dated amendments — 09 wins over 08 and 06 |
| [docs/10-metrics-spec.md](docs/10-metrics-spec.md) | Authoritative for every metric definition and the default engine parameters |
| [docs/16-prescribed-progression.md](docs/16-prescribed-progression.md) · [docs/17-macrocycle-goals.md](docs/17-macrocycle-goals.md) | Progression internals; the macrocycle goal layer |
| [docs/19-prescription-explanation-v3.md](docs/19-prescription-explanation-v3.md) · [docs/21-exercise-level-rir.md](docs/21-exercise-level-rir.md) | How a prescription is explained; exercise-level RIR |
| [docs/22-user-manual.md](docs/22-user-manual.md) · [docs/22a-manual-claims.md](docs/22a-manual-claims.md) | The User Guide's spec, and the claims ledger tying every sentence to the code that makes it true |
| [docs/23-versioning-releases.md](docs/23-versioning-releases.md) | Versioned releases, release notes, and the What's New gate |

[CLAUDE.md](CLAUDE.md) carries the full annotated index (including the docs not
listed here) and the hard rules every change is held to.

## Getting started

```bash
npm install
cp .env.example .env.local   # add Supabase keys
npm run dev
```

Local Supabase development uses the Supabase CLI (`supabase start`, migrations in `supabase/migrations/`). See [docs/02-architecture.md](docs/02-architecture.md) for details.

## Status

**Built and in use — released at v1.1.0** (the User Guide block, 2026-08-13;
v1.0.0 was cut a week earlier). Releases are versioned `MAJOR.FEATURE.FIX` per
[docs/23-versioning-releases.md](docs/23-versioning-releases.md), and the
registry in `src/content/releases/` is the record of what each one shipped.

For where the build actually stands — including anything shipped but not yet
live — read [docs/PROGRESS.md](docs/PROGRESS.md) and the live index in
[docs/notes/backlog.md](docs/notes/backlog.md);
[docs/07-implementation-plan.md](docs/07-implementation-plan.md) is the original
build sequence.
