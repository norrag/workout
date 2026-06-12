# 01 — Product Specification

## Vision

A production-quality, PWA-first web application for scientifically tracking workouts through defined cycles, with dynamic workout planning and guidance powered by in-app user feedback and research-backed training techniques (periodization + RIR-based autoregulation). The app supports multiple users, full cycle tracking, exercise/weight/rep/set logging, notes and feedback, program design, and AI-assisted insight via MCP.

The core differentiator: **user feedback after exercises, sets, and cycles is used to track and score progress and to automatically plan future sets, reps, and loads** against user-defined goals.

## Domain model (conceptual)

### Macrocycle
- The broad phase lasting **months to years** in which the user defines long-term fitness goals: **cutting, gaining, or maintaining**.
- Defines goals, timelines, and metrics that inform dynamic mesocycle guidance and assess progress spanning multiple mesocycles.
- A macrocycle contains an ordered series of mesocycles working toward its goal.

### Mesocycle
- A **3–6 week planned block** of workouts geared toward the macrocycle goal. The heart of where users plan and track training.
- Uses scientific progression of intensity via **targeted Reps In Reserve (RIR)**:
  - The meso culminates in a **0 RIR peak week** (the final week, or next-to-final if a deload week is used).
  - The plan works backward from the peak: start around **3 RIR** and progress weekly toward **0 RIR**.
- Subsequent mesos progress the user toward the macrocycle target — building strength or muscle by increasing weight, reps, or sets across muscle groups over time, or maintaining per the macro goal.

### Microcycle
- A **1-week slice** of a mesocycle. The user picks the meso length in weeks; the meso divides into that many microcycles.
- Each week has a **target RIR** defined by the meso plan.
- The user logs weights, sets, reps, and feedback across exercises throughout the week.
- Performance + feedback algorithmically plan the **next week's** weights, sets, and reps, ramping intensity to the 0 RIR peak, followed by an optional **deload week** of decreased work.

## Core features

### F1 — Accounts & profiles
- Email/password and OAuth sign-in (Supabase Auth).
- Profile: age, gender, experience/fitness level, preferred exercise types (machines, free weights, etc.), units (kg/lb).

### F2 — Cycle management
- Create/edit/archive macrocycles with goal type, target metrics, and timeline.
- Create mesocycles inside a macrocycle: choose weeks (3–6), days/week, deload toggle, start from a template or from scratch.
- Microcycles generated automatically from meso length, each with its target RIR.
- Cycle dashboard: current position in macro → meso → micro → day.

### F3 — Workout logging
- Today's planned workout with prescribed exercises, target weight × reps × sets, and target RIR.
- Log actual weight/reps per set; add/remove/swap sets and exercises; notes per set/exercise/workout.
- **Per-exercise feedback** (fig 1.4): joint pain during the exercise, plus muscle-group pump and workload sliders.
- **Workout feedback**: session summary, autoregulation summary, and free-text workout notes on completion.
- Every logged entry is stamped with macro/meso/micro/day context and date.
- Logging requires connectivity (decision, 08 §3 era): the app is online-only; no offline queue/sync.

### F4 — Feedback & progression engine
- Computes next-week prescriptions (weight, reps, sets) per exercise from the signals listed in [04-feedback-engine.md](04-feedback-engine.md).
- Progress scoring per exercise, muscle group, meso, and macro.
- **Admin/dev tuning via MCP** (no admin UI): inspect inputs/outputs, adjust algorithm parameters, replay decisions against historical data — all through admin-gated MCP tools, with Claude as the tuning console.

### F5 — Exercise library
- **Stock exercises** visible to all users; **custom exercises** visible only to their author.
- Exercise attributes: muscle group(s), author, equipment type (dumbbell, barbell, machine, cable, smith machine, bodyweight, etc.).
- Sharing: users can share custom exercises directly, or implicitly by sharing templates/mesos that include them (shared copies resolve cleanly — see data model §Sharing).

### F6 — Templates
- Reusable groups of workouts/exercises with filterable criteria: emphasis (arms, legs, upper, lower, full body…), author, intended gender, days per week.
- Start a mesocycle from a template; save a meso as a template; share templates.

### F7 — Meso stats & history (not a tab — see 08 §2)
- Meso stats behind `MESO STATS` on meso detail: volume (sets per muscle group per week, logged + autoregulated plan), balance (push/pull/legs, per-muscle bars), performance (top set by week, e1RM across the macro, PRs).
- Per-exercise history (weight × reps by session, e1RM) in the exercise library and picker.

### F8 — MCP connector
- An MCP server exposing the user's training data and planning tools to their LLM of choice: analysis of macro/meso/micro performance, mesocycle planning/creation, template creation, goal editing, and personalized recommendations. See [05-mcp-connector.md](05-mcp-connector.md).

## Non-functional requirements

- **PWA-first**: installable, fast on mobile, usable mid-workout with one thumb, resilient to flaky gym connectivity.
- **Production quality**: typed end-to-end, tested business logic (the progression engine especially), CI on every PR, RLS enforced on every table.
- **Data accessibility**: schemas designed for consumption by both internal algorithms and MCP tools.
- **Performance**: logging interactions must feel instant (optimistic UI); dashboard loads < 2s on 4G.

## Out of scope (v1)

- Native iOS/Android apps (PWA only).
- Wearable/health-platform integrations.
- Social feed / community features beyond direct sharing.
- Nutrition tracking (macro goals reference body-weight direction only).
- Offline logging / background sync (online-only; revisit post-launch if demanded).
- Admin/tuning UI screens (the capability ships as MCP tools instead).

## Primary user stories

1. As a lifter, I define a macrocycle ("gain muscle through summer") so my training blocks have direction.
2. As a lifter, I create a 5-week mesocycle from a 4-day upper/lower template, and the app schedules my weeks from 3 RIR down to 0 RIR plus a deload.
3. As a lifter, I open today's workout and see exactly what weight/reps/sets to do, log my sets in a few taps, and answer three quick feedback prompts.
4. As a lifter, next week's plan reflects how last week actually went — heavier where I was strong, backed off where joints complained.
5. As a lifter, I connect Claude to my data over MCP and ask "how did my last meso go, and what should the next one look like?" and get analysis grounded in my real numbers — and it can draft the next meso for me.
6. As an admin/developer, I connect Claude over MCP and inspect why the engine prescribed what it did, replay history against candidate parameters, and activate a tuned version safely — no deploy, no admin UI.
