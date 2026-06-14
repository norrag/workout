# Design artifacts (Claude Design handoff, June 2026)

Visual source of truth for the screens described in [../08-design-decisions.md](../08-design-decisions.md), amended by [../09-design-changelog.md](../09-design-changelog.md). Figure numbers refer to `mockups/workout - App Screens v2.dc.html` — the authoritative file. The current figure index lives in 08 §5 (reconciled with the 2026-06-13/14 sessions).

- `mockups/workout - App Screens v2.dc.html` — **the source of truth** for all UI; updated through the 2026-06-14 session. Read the HTML/CSS source directly for dimensions, colors, and layout rules.
- `mockups/WorkoutApp.dc.html` — interactive prototype **app component** (mounted twice, paper + dark themes). Reference only; **the mockup wins where the two diverge.**
- `mockups/workout - Interactive Prototype.dc.html` — side-by-side device board hosting `WorkoutApp` in both themes.
- `mockups/workout - App Screens.dc.html` — earlier round (three explorations); historical context only.
- `mockups/Logging Directions.dc.html` — earliest logging-UX explorations; historical context only.
- `mockups/support.js`, `mockups/ios-frame.jsx` — prototype runtime imported by the HTML files.
- `screenshots/` — rendered captures of the older v2 screens; `screenshots/v2-session3/` — renders from the 2026-06-14 session (day-view collapsed/expanded, macrocycle overview, create-macro, two-tab meso stats, dark/paper boards).

These are prototypes, not production code: recreate the visual output in the app's stack; don't copy their internal structure. The **mockup is authoritative over the interactive prototype** — when they diverge, the prototype is brought back in line (see ../CLAUDE.md and 09 2026-06-14).
