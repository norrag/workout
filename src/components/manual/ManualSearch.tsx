"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { SearchHit, SearchIndex } from "@/content/manual/search";
import { searchManual } from "@/content/manual/search";
// `ids` and never the registry barrel: this is a client component, and the
// barrel would pull every chapter into the reading path's bundle (D3 guard 1)
import { MANUAL_LABEL } from "@/content/manual/ids";

/**
 * Guide search (fig 4.11; 09-changelog 2026-08-08 §2).
 *
 * Live-filters as you type — the app's own search grammar (P20, the exercise
 * library) rather than a submit-and-render form, because a reader who does not
 * know the manual's vocabulary needs to see the shape of the corpus move under
 * their query.
 *
 * **The index arrives on the first query, not with the screen** (doc 22 D3,
 * guard 3). `search-index.ts` is reachable only through the dynamic `import()`
 * below, which makes it its own hashed chunk: nothing on the reading path pays
 * for it, it is immutable by URL so the existing `CacheFirst` rule covers it,
 * and it is excluded from the precache manifest by chunk name.
 */
const MIN_QUERY = 2;
const LIMIT = 20;

export function ManualSearch() {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const requested = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const load = useCallback(() => {
    if (requested.current) return;
    requested.current = true;
    setLoading(true);
    void import(
      /* webpackChunkName: "manual-search-index" */ "@/content/manual/search-index"
    )
      .then((mod) => setIndex(mod.MANUAL_SEARCH_INDEX))
      .finally(() => setLoading(false));
  }, []);

  const onChange = (value: string) => {
    setQuery(value);
    if (value.trim().length >= MIN_QUERY) load();
  };

  const ready = query.trim().length >= MIN_QUERY;
  const hits: SearchHit[] = useMemo(
    () => (index && ready ? searchManual(index, query, LIMIT) : []),
    [index, query, ready],
  );

  return (
    <div>
      <div className="mt-5 border-[1.5px] border-ink">
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search the guide"
          aria-label="Search the guide"
          className="w-full bg-transparent px-4 py-3.5 text-sm outline-none placeholder:text-ink/35"
        />
      </div>

      {!ready ? (
        <p className="mt-4 text-[13px] leading-[1.5] text-ink/55">
          Type at least{" "}
          <span className="numeral">{MIN_QUERY}</span> characters. Results are
          sections — each one opens on its own screen.
        </p>
      ) : loading && !index ? (
        <p className="label-caps mt-4 text-[9.5px] font-semibold tracking-[0.12em] text-ink/45">
          Searching…
        </p>
      ) : hits.length === 0 ? (
        <p className="mt-4 text-[13px] leading-[1.5] text-ink/55">
          Nothing matched that. Try a word the guide would use — a screen name,
          a term from the app, or what you are trying to do.
        </p>
      ) : (
        <>
          <div className="label-caps mt-6 flex items-baseline justify-between border-b-[1.5px] border-ink pb-1.5 text-[10px] font-bold tracking-[0.14em]">
            <span>Results</span>
            <span className="numeral font-medium text-ink/45">
              {hits.length}
            </span>
          </div>
          {hits.map(({ doc, snippet }) => (
            <Link
              key={doc.id}
              href={doc.route}
              className="block border-b border-ink/15 py-3.5"
            >
              {/* Keep the Guide label visible when a result is handed back by
                  the connector retrieval surface. */}
              <span className="label-caps block text-[9.5px] font-semibold tracking-[0.12em] text-ink/45">
                {MANUAL_LABEL[doc.manual]} · CH{" "}
                <span className="numeral">{doc.chapterNumber}</span> ·{" "}
                {doc.chapterTitle}
              </span>
              <span className="mt-1 block text-[15px] font-bold">
                {doc.title}
              </span>
              <span className="mt-0.5 block text-[13px] leading-[1.5] text-ink/60">
                {snippet}
              </span>
            </Link>
          ))}
        </>
      )}
    </div>
  );
}
