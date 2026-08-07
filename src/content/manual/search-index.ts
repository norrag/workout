// The built search index — doc 22 D3, guard 3.
//
// Its own module for one reason: it is the manual's only artifact big enough
// for the owner's launch-cost condition to bite, so it must be reachable
// **exclusively** through a dynamic `import()`. That makes it a separate hashed
// chunk under `/_next/static/`, which is
//
//   - fetched on the first query and never before (nothing on the reading path
//     pays for it),
//   - immutable by URL, so `sw.ts`'s existing `CacheFirst` rule gives it
//     offline-after-first-use for free and hard rule 9 is satisfied verbatim,
//   - and excluded from the precache manifest by name (guard 2 —
//     `next.config.ts`'s `globIgnores`, which is why the chunk is named).
//
// Nothing may import this module statically. `guards.test.ts` asserts it.

import { CHAPTERS } from "./index";
import { buildSearchIndex } from "./search";

export const MANUAL_SEARCH_INDEX = buildSearchIndex(CHAPTERS);
