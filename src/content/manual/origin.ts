// doc 22 §9.4.4 / §9.4.6 — where the reader came from.
//
// N27, the app's standing rule: always back-link where you came from. A manual
// section is the surface where that matters most, because Phase 7 will send
// readers into one from the middle of a workout — and a back link reading
// `‹ EFFORT: RIR AND THE RAMP` would strand them in the guide.
//
// The app already has this grammar: `?from=` on the exercise page and on meso
// stats (N4). The manual reuses it rather than inventing a second one.
//
// **`from` is user-controllable**, so it is validated against an allowlist of
// in-app prefixes rather than merely checked for a leading slash. Anything
// unrecognized is dropped and the chapter breadcrumb stands — a wrong-looking
// back link is a worse failure than no origin at all.

export interface ManualOrigin {
  /** where the back link goes — the caller's own path, query included */
  readonly href: string;
  /** tracked-caps label; the reader should recognize the screen by name */
  readonly label: string;
}

/**
 * Longest prefix wins, so `/cycles/plan` can be named more precisely than
 * `/cycles`. Labels are the app's own names for these screens.
 */
const ORIGINS: readonly { readonly prefix: string; readonly label: string }[] = [
  { prefix: "/workout", label: "WORKOUT" },
  { prefix: "/log", label: "WORKOUT" },
  { prefix: "/cycles", label: "CYCLES" },
  { prefix: "/exercises", label: "EXERCISES" },
  { prefix: "/templates", label: "TEMPLATES" },
  { prefix: "/more/connector", label: "AI CONNECTOR" },
  { prefix: "/more/guide", label: "GUIDE" },
  { prefix: "/more/profile", label: "PROFILE" },
  { prefix: "/more", label: "MORE" },
];

/**
 * Resolve a `?from=` value, or `null` when it is absent, malformed, or points
 * anywhere but this app. Pure — the routes hand it a search param.
 */
export function resolveOrigin(from: string | undefined): ManualOrigin | null {
  if (!from) return null;
  // a protocol-relative or backslash-prefixed path is an off-site redirect
  // wearing a leading slash
  if (!from.startsWith("/") || from.startsWith("//") || from.startsWith("/\\")) {
    return null;
  }
  if (from.includes("\\") || from.includes("://")) return null;
  const path = from.split(/[?#]/)[0];
  const match = ORIGINS.filter(
    (o) => path === o.prefix || path.startsWith(`${o.prefix}/`),
  ).sort((a, b) => b.prefix.length - a.prefix.length)[0];
  if (!match) return null;
  return { href: from, label: match.label };
}
