# Body records beside training: review, proposal and roadmap

Status: **proposal for owner review**, 2026-11-08. T-N96d / N66. Nothing in this
document activates analysis, changes a prescription, or expands the 1.3 capture
release. The owner wants transparent underlying measurements, strength, weight
and DEXA data across time. They do not want packaged scores or narrative verdicts.

## 1. Recommendation

Put a quiet **Body records** entry on the mesocycle Overview. It should open a
dated comparison of waist, limbs, body weight, related training and scan records.
Keep the comparison useful when the sources have different dates or no overlap.
Start with a ledger and small plots that share a calendar axis. Keep each unit
on its own scale. Show the observations before any derived change.

The first question is: **what changed, in which observations, over which dates?**
The user can then compare waist with limbs and related strength. The product
must make that judgment easier without turning those proxies into a claim about
how much muscle or fat the user gained. Do not attach an automatic verdict,
color grade, composite score, target adjustment or coaching narrative.

This is a separate feature after the current capture release. Finish 1.3's
functional verification and obtain release approval first. Future screens need
the mockup pass required by AGENTS.md and docs 08/09 before implementation.

## 2. Existing contracts and source audit

This review extends the short [November 7 direction](2026-11-07-body-records-future-direction.md).
The implementation must respect these existing authorities:

| Authority / code | Existing behavior | Consequence for this proposal |
|---|---|---|
| [Doc 24](../24-body-measurements.md); `lib/measure/tape.ts`; `queries/measure/tape.ts` | Twelve optional tape sites, stable left/right keys, date-only sessions, canonical inches and recorded input unit; corrections and deletion | Reuse those facts. Do not introduce a second tape log or silently merge relaxed/flexed sites |
| `mcp/tools/measurements.ts::formatBodyMeasurements` | Deltas use earlier same-site observations **within the returned page**; first available baseline can be null | A cross-period comparison must query its needed endpoints explicitly, rather than treating a paged tool response as a complete history |
| `queries/bodyweight.ts`; docs 17/20 | Dated weight observations and a broader future smoothing direction | First comparison uses raw observations. No new smoother, daily-weight capture or implied daily endpoint is bundled in |
| `engine/e1rm.ts`; `queries/stats.ts`; docs 10/21 | Shared strength estimates and logged/assigned effort rules | Reuse the existing definition and expose its inputs. Do not create a new circumference-based strength estimate |
| `queries/body-comp.ts::scanCompForSpan`; docs 15/17 | Scan brackets, interval metadata, matching model strings and global change bands | Audit the comparison labels before reusing them as certainty statements |
| [Doc 20](../20-measure-companion-app.md), principles and seam | Transparent source facts; no composite; derived projections do not reach the engine | Keep this read-only view inside the current app. The broader companion topology and projection work remain separate decisions |
| Docs 22/22a/22e | Guide, claim ledger and earned help-link placement | Document actual baseline rules, source limits and missing states with the feature; use existing help patterns |
| [Doc 23](../23-versioning-releases.md) | A staged feature is activated by a release PR | Use a later feature block and preview override. This proposal is not a release switch |

Two existing accuracy tasks are prerequisites for honest DEXA comparison:
**T-N96b**: matching `scanner_model` does not identify a physical machine or
establish cross-calibration. **T-N96c**: the current 2 lb / 1 percentage-point
bands are heuristics, not measured individual least-significant change. These
are separate from tape capture and must not be silently imported into a new UI
as a guarantee. Do not change engine inputs as part of correcting display labels.

## 3. What the evidence supports

**Tape can be useful, with limits.** Gentil et al. compared flexed arm
circumference and ultrasound changes using data from 67 young men after 10–12
weeks of training. Both detected change, but estimates were not interchangeable.
That supports retaining inexpensive circumference records. It does not validate
individual tissue attribution, other body sites, or the app's **relaxed** upper-arm
protocol. The app should not label a circumference delta as muscle gained.
[Study and methods](https://pmc.ncbi.nlm.nih.gov/articles/PMC7787222/).

**A location is part of the observation.** WHO's waist report reviews different
measurement protocols and their operational effects. The app currently records
`waist_navel`; that should remain explicit. Do not relabel it as a rib–iliac-crest
midpoint measurement, substitute a clinical threshold from another protocol, or
combine the two into one continuous series. [WHO report](https://www.who.int/publications-detail-redirect/9789241501491).

**DEXA needs acquisition context.** In a controlled study of 31 active adults,
Nana et al. found that daily activities and breakfast affected the variability
and estimates of lean mass; regional results also had measurement error. This
supports preserving scan dates and preparation context. It does not justify
correcting a user's lean mass by a generic hydration formula.
[Original study](https://pubmed.ncbi.nlm.nih.gov/22179140/).

ISCD's **body-composition** positions require consistent preparation/positioning,
precision assessment and appropriate cross-calibration when comparing systems.
The same make/model alone is insufficient. Reported lean mass is not a direct
measurement of skeletal-muscle gain. Use the provider's exact compartment labels.
Do not transplant bone-density LSC thresholds into soft-tissue comparisons or
label an unvalidated global band as this person's measurement error.
[ISCD positions, Body Composition](https://iscd.org/text-based-official-adult-positions/).

**Strength retains an effort and exercise context.** Zourdos et al. studied a
RIR-based effort scale in 29 squatters with different experience. It supports
recording perceived effort, not assuming that all athletes report it identically.
The app's estimate must remain labeled as an estimate, with reported versus
assigned RIR distinguishable. An increased estimate is not independent proof of
hypertrophy. [Original study](https://pubmed.ncbi.nlm.nih.gov/26049792/).

The product choices below are design proposals based on those limits and the
repository's contracts. They are not validated biological classifiers.

## 4. User questions and the evidence to place together

| User question | Show together | Leave to the user |
|---|---|---|
| Are my arms getting larger as my lifts improve? | Left/right relaxed-arm observations, dated deltas, and chosen exercise's load/reps/RIR and existing estimate | Whether those changes reflect muscle, fat, fluid, technique or measurement variation |
| Is waist changing differently from limbs? | Waist and chosen limb rows in the same date window, with each row's actual endpoint dates | A fat-versus-size judgment; no waist-to-muscle conversion or traffic-light verdict |
| What happened during this block? | Training observations inside the mesocycle and body records that actually fall inside it | Whether outside-window measurements are informative context |
| What does the latest scan add? | Two dated scan records, their component values, acquisition metadata and raw differences | Whether the difference is meaningful given comparability and precision information |
| Why do the sources disagree? | The underlying records, methods, actual intervals and missing coverage | The explanation; do not fabricate a reconciled tissue estimate |

Include simple factual labels such as `2 readings · 35 days apart`. Avoid
`good progress`, `recomposition`, `lean gain confirmed` or an aggregate `body
progress` number. An annotation can state what is missing or how a number was
calculated; it must not supply a packaged interpretation of the person.

## 5. Baseline and time-window contract

Make one period explicit at the top: mesocycle dates, a calendar range or an
owner-selected wider range. The wider view is important because monthly tape
and quarterly scans may not bracket a short block. Selecting a period does
not create measurements on its boundary dates.

For the first implementation, use this conservative rule:

1. For each tape site, select the first and last **actual** observations inside
   the period. Show both dates. One observation has a value but no delta.
2. Show each row's coverage separately. Chest measured on January 4 and February
   8 is a 35-day comparison even if waist's dates differ. Do not imply aligned
   endpoints just because the rows are adjacent.
3. With no pair inside a period, show `No pair in this period`. Offer the raw
   series or a deliberate wider period. Do not silently take a nearby outside
   record. If a later design permits outside context, label its date and status
   beside the value and keep it out of an in-period delta.
4. Keep DEXA scans as dated events. Two scans define a scan-to-scan interval;
   they do not prove what happened during each intervening month. Do not draw
   a line through quarterly values that reads as monthly observations.
5. For training, show the actual exercise observations inside the period using
   the existing shared estimate rules. Preserve exercise/equipment identity,
   tracking type, deload policy and whether effort was reported or assigned.

These are proposed defaults, not a claim that the current `scanCompForSpan`
tolerance or MCP paging already implements them. Endpoint policies should be
pure functions with explicit inputs and versioned tests. Avoid percentages per
month in the first view: sparse, unequal intervals can make them look more
comparable than the observations warrant.

Date-only tape observations remain calendar dates. Do not fabricate a midnight
UTC timestamp that changes the displayed day in another timezone. Scan and
workout timestamps retain their source timezone/offset and display convention.
The query contract must state how a selected calendar period maps to timestamps.

## 6. Proposed information architecture and display

The mesocycle Overview entry should be small and read-only. Show the selected
period and data coverage, then a link to the comparison. Do not crowd the main
Workout page or add body-entry requirements to completing a session.

The comparison has three layers:

- **Ledger first:** site or metric, baseline value/date, latest value/date,
  arithmetic difference/unit, observation count and coverage/comparability note.
  Waist and limbs remain visible together. The user can choose additional sites.
- **Aligned small plots:** one calendar axis, separate panels for circumference,
  weight, chosen exercise and scan components. Use labeled points at actual
  observation dates. Different units retain their own scales. No dual-axis plot
  that makes unrelated slopes appear equivalent; no hidden normalization.
- **Source records:** open the original tape session, workout sets or scan from
  the corresponding row. Corrections occur at the source and recompute the view.

For limbs, keep left and right separate. A bilateral average should be deferred
unless explicitly requested and labeled with its method and missing-side rule.
An exercise association is user-selected context, not an anatomical conversion.
Pressing strength does not become a measurement of chest tissue.

Use the existing light/dark/system tokens, square ledger geometry, labels and
table/chevron grammar. Color should identify selection and source, not grade
body changes as successes or failures. A table must remain usable without the
plots. Test large text, keyboard navigation and screen-reader labels for values,
dates, signed differences and units. Prepare sparse/missing cases in Phase 0,
not only a dense example with perfectly aligned dates.

## 7. Data and query design

Read existing owner-scoped records. Do not duplicate observations in an
`insights` table or store precomputed verdicts. A pure comparison function can
return a typed row with this proposed shape:

```ts
type ComparisonRow = {
  source: "tape" | "weight" | "strength" | "dexa";
  metricKey: string;
  unit: string;
  baseline: { recordId: string; date: string; value: number } | null;
  latest: { recordId: string; date: string; value: number } | null;
  delta: number | null;
  observationCount: number;
  requestedPeriod: { start: string; end: string };
  actualIntervalDays: number | null;
  method: string;
  coverage: "none" | "single" | "pair";
  comparabilityNotes: string[];
};
```

This is a design sketch, not a schema migration. The production contract should
also carry stable method/version identifiers, reported/assigned effort metadata
where relevant, and an explicit unknown value rather than inferring acquisition
details. Use record IDs for authorized drill-through, not as caller-supplied
identity. Never accept `user_id` in an MCP argument.

Fetch a bounded date range and only the columns required. If the chosen endpoint
policy needs predecessor rows, fetch them explicitly by site/source with a clear
outside-period label. Test query plans and add indexes only when evidence shows
they are needed. Retain RLS/default deny and invoker semantics. Share the pure
comparison definition between the app and a future read-only MCP tool.

Data-quality additions should be separate, backward-compatible work:

- Per-site notes (T-N96a), with ownership, export, deletion and MCP policy agreed
  before implementation. Free text is not a hidden input to prescriptions.
- A protocol identifier if capture cues or relaxed/flexed posture can change.
  Existing records need an honest legacy/unknown label, not invented metadata.
- Optional repeat readings only after a simple capture design is approved.
  Preserve the individual readings and state the chosen aggregation method.
- DEXA machine/site/software/preparation metadata when the provider supplies it.
  Missing metadata remains unknown; do not infer physical machine from model.

No mandatory repeat-entry burden or extra database migration belongs in the
current release solely to anticipate this proposal.

## 8. Arithmetic, uncertainty and correction rules

An arithmetic difference is latest minus baseline in the selected display unit.
Compute from canonical stored precision, then round for display. Do not subtract
already rounded display strings. A displayed hundredth of an inch is formatting,
not evidence of that level of tape accuracy. An empty cell is not zero.

Do not reuse typo-review ranges as uncertainty bands. The current broad ranges
and large-change prompts only catch possible entry mistakes and allow explicit
confirmation. A confirmed unusual value remains a recorded observation. Future
comparability labels should explain method/context rather than hide the value.

Do not invent an individual tape error bar from one or two readings. A study's
group-level reliability is not this user's precision. Likewise, provider or
facility precision information must be identified by source and method; otherwise
show unknown precision. Preserve raw differences without calling them clinically
significant. Scan estimates remain estimates and do not settle an ambiguous tape
or strength pattern.

Editing or deleting a source record must invalidate the derived comparison.
CSV and MCP should agree with the app for the same period, method and baseline
policy. Document any paging limit rather than returning an apparently complete
but truncated timeline. Keep the online-read policy; do not introduce health-data
runtime caching as a side effect of adding plots.

## 9. Phased delivery and exit criteria

| Phase | Deliverable | Exit criterion / dependency |
|---|---|---|
| 0 — release discipline | Finish 1.3 capture, navigation tests and approved regular modal | Current release is verified and owner approves merge/release; this future work does not delay a correct capture release |
| 1 — accuracy review | T-N96b/c review, actual provider metadata inventory, honest scan-comparison terminology | No model-string-as-machine claim or generic band presented as individual precision; required label changes have Guide/claim updates |
| 2 — comparison contract | Explicit period/endpoint rules, pure typed functions, fixture pack and query audit | Tests cover missing, unequal and outside dates; app/MCP definitions agree; no prescription dependency introduced |
| 3 — Phase 0 design | Overview entry and ledger/plots/source drill-through mockups | Owner reviews light/dark, mobile, large-text and sparse states before code; no second narrow release-modal design |
| 4 — read-only vertical slice | Overview entry, tape/weight ledger and source navigation | Owner can answer the first two questions from actual values and dates; partial records remain useful; RLS and performance checks pass |
| 5 — training and scans | Selected exercise rows, existing effort-aware estimate, scan events and comparability context | No hidden exercise substitutions, unmatched dates, tissue inference or overstated scan confidence; signed-in end-to-end coverage |
| 6 — connector and export | Bounded read-only comparison retrieval and matching export | Identity derives from session; two-owner tests; baseline/coverage/method fields retained; no write/delete surface added by accident |
| 7 — field review | Owner uses it across several real monthly records and a scan interval | Review usefulness, capture burden and confusing comparisons before adding calculations; later changes get separate staged entries |

Each phase is a small draft PR with its own documentation and validation. Order
reflects dependencies, not promised calendar dates. Per-site notes can be a
separate capture PR; additional smoothing, Apple Health integration, daily weight
logging or the MEASURE shell remain N66 decisions. Do not bundle them into this
comparison to make its dashboard look fuller.

## 10. Test and review matrix

The fixture pack should include at least:

1. No body records; one tape session; waist-only partial sessions; left-only data.
2. Different site dates and missing sites between sessions; no pair in a block.
3. A scan pair outside the mesocycle; only one scan; same model/unknown machine;
   different known systems; missing preparation metadata; unknown precision.
4. A corrected or deleted baseline; a unit switch; small deltas that round to
   zero; same-date conflicts; a future-dated typo; leap day and timezone edges.
5. Exercise changes, equipment changes, deloads, assigned versus reported RIR,
   high-RIR observations and too few eligible sets for the existing estimate.
6. One user's record ID requested by another user, anonymous access, pagination
   boundaries, export completeness and source deletion/account deletion.
7. Mobile widths and short viewports, large text, dark/system themes, missing
   network, slow responses and repeated source navigation.

Success is not a high dashboard engagement count. Ask the owner to identify the
exact records behind each delta, explain when dates differ, and find what is
missing without a generated explanation. A view that is quick to read but hides
those facts fails the transparency requirement.

## 11. Decisions to settle before implementation

Recommended defaults are a mesocycle Overview entry, explicit wider-period
selection, first/last in-period observations, separate left/right sites, raw
weight and user-selected exercise context. Review these in the mockup pass.

Open questions: which metrics deserve the small Overview preview; whether to
allow deliberately selected outside-window endpoints; which source metadata
BodySpec can actually supply; and whether repeat tape readings are worth the
capture effort. These are bounded product decisions, not a request to approve a
generic analytics engine. No automated tissue classifier is proposed.

## 12. Research limits and maintenance

Sources were checked on 2026-11-08. The cited studies support measurement and
presentation cautions; they do not validate this future interface or a personal
fat/muscle interpretation. Recheck the actual provider schema, current ISCD
positions and the app's metric definitions at implementation time. Keep a small
claim ledger for each scientific label. Cite the source near the claim and state
where the product applies a design judgment.

This proposal deliberately preserves the owner's preferred division of work:
the app organizes the evidence; the user judges the pattern. No projection,
score, generated verdict, medical classification or prescription input is added.
