"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { LeaveConfirm } from "@/components/ui/LeaveConfirm";
import { useNavigationGuard } from "@/components/ui/useNavigationGuard";
import { GuideLink } from "@/components/ui/GuideLink";
import { GUIDE_LINKS } from "@/lib/guide-links";
import { localDayIso, shortDateWithYear } from "@/lib/dates";
import {
  TAPE_SITES,
  compareTapeSessions,
  daySpan,
  fromInches,
  nextMonthlyDate,
  siteHistory,
  tapeDelta,
  tapeSessionSchema,
  tapeValue,
  toInches,
  type TapeSession,
  type TapeSiteKey,
  type TapeUnit,
} from "@/lib/measure/tape";
import { removeMeasurements, saveMeasurements } from "./actions";

const caps = "text-[10px] font-bold tracking-[0.12em]";
const muted = "text-ink/70";
const action =
  "min-h-11 border-[1.5px] border-ink px-4 py-3 text-xs font-bold tracking-[0.12em]";

function UnitToggle({
  unit,
  onChange,
  disabled = false,
}: {
  unit: TapeUnit;
  onChange: (unit: TapeUnit) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="flex border-[1.5px] border-ink"
      role="group"
      aria-label="Measurement units"
    >
      {(["in", "cm"] as const).map((u) => (
        <button
          key={u}
          type="button"
          disabled={disabled}
          aria-pressed={unit === u}
          className={`${caps} min-h-11 min-w-14 px-3 ${unit === u ? "bg-ink text-bg-base" : muted}`}
          onClick={() => onChange(u)}
        >
          {u.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export function Measurements({ sessions }: { sessions: TapeSession[] }) {
  const [tab, setTab] = useState<"latest" | "history">("latest");
  const [unit, setUnit] = useState<TapeUnit>(sessions[0]?.input_unit ?? "in");
  const [editing, setEditing] = useState<TapeSession | "new" | null>(null);
  const [baselineId, setBaselineId] = useState(sessions[1]?.id ?? "");
  const [site, setSite] = useState<TapeSiteKey>("chest");
  const [status, setStatus] = useState("");
  const latest = sessions[0];
  const baseline =
    sessions.slice(1).find((s) => s.id === baselineId) ?? sessions[1];
  const history = siteHistory(sessions, site);
  const sortedReadings = latest
    ? compareTapeSessions(latest, baseline).sort(
        (a, b) =>
          TAPE_SITES.findIndex((s) => s.key === a.site_key) -
          TAPE_SITES.findIndex((s) => s.key === b.site_key),
      )
    : [];

  return (
    <>
      <button
        type="button"
        className={`${action} mt-5 w-full bg-ink text-bg-base`}
        onClick={() => {
          setStatus("");
          setEditing("new");
        }}
      >
        + LOG MEASUREMENTS
      </button>
      <p role="status" className={`${caps} mt-2 min-h-4 ${muted}`}>
        {status}
      </p>
      {!latest ? (
        <>
          <div className="mt-4 border border-dashed border-ink/40 px-4 py-6">
            <div className={caps}>NO MEASUREMENTS YET</div>
            <p className="mt-3 text-sm leading-relaxed">
              Start with chest, waist, arms and legs. Add only the sites you
              want to follow.
            </p>
          </div>
          <p className={`mt-4 text-sm leading-relaxed ${muted}`}>
            Use the same landmarks and conditions each time. Keep the tape snug
            without compressing the skin.
          </p>
        </>
      ) : (
        <>
          <div
            className="mt-3 flex border-[1.5px] border-ink"
            role="group"
            aria-label="Measurement view"
          >
            {(["latest", "history"] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tab === t}
                className={`${caps} min-h-11 flex-1 py-3 uppercase ${tab === t ? "bg-ink text-bg-base" : muted}`}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between gap-4">
            <span className={`${caps} ${muted}`}>DISPLAY UNITS</span>
            <UnitToggle unit={unit} onChange={setUnit} />
          </div>
          {tab === "latest" ? (
            <>
              <div className="mt-3 flex items-center justify-between border-b border-ink/15 py-3">
                <div>
                  <div className={caps}>
                    {shortDateWithYear(latest.measured_on)}
                  </div>
                  <div className={`mt-1 text-xs ${muted}`}>
                    {latest.readings.length}{" "}
                    {latest.readings.length === 1 ? "site" : "sites"} · recorded
                    in {latest.input_unit === "in" ? "inches" : "centimetres"}
                  </div>
                </div>
                <button
                  type="button"
                  className={`${caps} min-h-11 px-3`}
                  onClick={() => setEditing(latest)}
                >
                  EDIT &gt;
                </button>
              </div>
              <div className="mt-4 border-b-[1.5px] border-ink pb-2">
                {baseline ? (
                  <label className={`${caps} block`}>
                    COMPARE WITH
                    <select
                      aria-label="Comparison session"
                      value={baseline.id}
                      onChange={(e) => setBaselineId(e.target.value)}
                      className="mt-2 min-h-11 w-full border border-ink/40 bg-bg-base px-3 text-sm font-semibold tracking-normal"
                    >
                      {sessions.slice(1).map((s) => (
                        <option key={s.id} value={s.id}>
                          {shortDateWithYear(s.measured_on)} ·{" "}
                          {daySpan(s.measured_on, latest.measured_on)} days
                          apart
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className={`${caps} ${muted}`}>
                    FIRST SESSION · A BASELINE FOR NEXT MONTH
                  </p>
                )}
              </div>
              {sortedReadings.map((r) => (
                <div
                  key={r.site_key}
                  className="flex items-center justify-between gap-3 border-b border-ink/15 py-3.5"
                >
                  <span className="text-sm font-semibold">
                    {TAPE_SITES.find((s) => s.key === r.site_key)?.label}
                  </span>
                  <div className="text-right">
                    <div className="numeral text-xl font-bold">
                      {tapeValue(r.value_in, unit)}{" "}
                      <span className={`${caps} ${muted}`}>
                        {unit.toUpperCase()}
                      </span>
                    </div>
                    <div className={`numeral mt-1 text-[11px] ${muted}`}>
                      {r.deltaIn == null
                        ? baseline
                          ? "No reading on comparison date"
                          : "First reading"
                        : `${tapeDelta(r.deltaIn, unit)} ${unit.toUpperCase()} · 2 readings`}
                    </div>
                  </div>
                </div>
              ))}
              {latest.note && (
                <p
                  className={`mt-4 whitespace-pre-wrap text-sm leading-relaxed ${muted}`}
                >
                  {latest.note}
                </p>
              )}
              <p className={`mt-4 text-xs leading-relaxed ${muted}`}>
                Differences are raw measurements from the two selected dates.
                Small changes can come from tape placement, breathing or
                hydration. Size alone does not distinguish muscle from fat.
              </p>
              <p className={`${caps} mt-5 ${muted}`}>
                NEXT MONTHLY CHECK ·{" "}
                {shortDateWithYear(nextMonthlyDate(latest.measured_on))}
              </p>
            </>
          ) : (
            <>
              <label className={`${caps} mt-5 block`}>
                SITE HISTORY · {unit.toUpperCase()}
                <select
                  aria-label="Measurement site"
                  value={site}
                  onChange={(e) => setSite(e.target.value as TapeSiteKey)}
                  className="mt-2 min-h-11 w-full border border-ink/40 bg-bg-base px-3 text-sm font-semibold tracking-normal"
                >
                  {TAPE_SITES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className={`${caps} mt-3 ${muted}`}>
                {history.length} {history.length === 1 ? "READING" : "READINGS"}{" "}
                · RAW DATED VALUES
              </p>
              {history.length === 0 && (
                <p
                  className={`mt-4 border border-dashed border-ink/40 p-4 text-sm ${muted}`}
                >
                  No readings for this site yet.
                </p>
              )}
              {[...history].reverse().map((r, i) => {
                const previous = history[history.length - i - 2];
                return (
                  <div
                    key={r.sessionId}
                    className="flex items-center justify-between border-b border-ink/15 py-3.5"
                  >
                    <span className={`${caps} ${muted}`}>
                      {shortDateWithYear(r.date)}
                    </span>
                    <div className="text-right">
                      <span className="numeral text-xl font-bold">
                        {tapeValue(r.valueIn, unit)}
                      </span>
                      <div className={`numeral mt-1 text-[11px] ${muted}`}>
                        {previous
                          ? `${tapeDelta(r.valueIn - previous.valueIn, unit)} ${unit.toUpperCase()} · ${daySpan(previous.date, r.date)} days`
                          : "First reading"}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className={`${caps} mt-6 border-b-[1.5px] border-ink pb-2`}>
                SESSIONS
              </div>
              {sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setEditing(s)}
                  className="flex min-h-16 w-full items-center justify-between gap-3 border-b border-ink/15 py-3.5 text-left"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">
                      {shortDateWithYear(s.measured_on)}
                    </div>
                    <div className={`mt-1 truncate text-xs ${muted}`}>
                      {s.readings.length}{" "}
                      {s.readings.length === 1 ? "site" : "sites"}
                      {s.note ? ` · ${s.note}` : ""}
                    </div>
                  </div>
                  <span className={`${caps} shrink-0`}>EDIT &gt;</span>
                </button>
              ))}
              <p className={`mt-4 text-xs leading-relaxed ${muted}`}>
                Same-site, same-side readings only. Skipped sites stay missing;
                gaps are never filled with estimated values.
              </p>
            </>
          )}
        </>
      )}
      <div className={`${caps} mt-6 border-b-[1.5px] border-ink pb-2`}>
        CONTEXT
      </div>
      {[
        {
          href: "/cycles",
          title: "Workout progress",
          sub: "Review strength in your cycles",
        },
        {
          href: "/more/bodyspec",
          title: "BodySpec DEXA",
          sub: "Review measured composition",
        },
      ].map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="flex min-h-16 items-center justify-between border-b border-ink/15 py-3.5"
        >
          <div>
            <div className="text-sm font-semibold">{l.title}</div>
            <div className={`mt-1 text-xs ${muted}`}>{l.sub}</div>
          </div>
          <span aria-hidden>&gt;</span>
        </Link>
      ))}
      <GuideLink
        to={GUIDE_LINKS.tapeMeasurements}
        from="/more/measurements"
        className="mt-4"
      />
      {latest && (
        <a
          href="/more/measurements/export"
          download
          className={`${caps} mt-4 flex min-h-11 items-center ${muted}`}
        >
          EXPORT MEASUREMENTS · CSV &gt;
        </a>
      )}
      {editing && (
        <MeasurementForm
          key={typeof editing === "string" ? "new" : editing.id}
          session={editing === "new" ? null : editing}
          sessions={sessions}
          initialUnit={unit}
          onClose={() => setEditing(null)}
          onSaved={(savedUnit, deleted) => {
            setUnit(savedUnit);
            setEditing(null);
            setStatus(deleted ? "SESSION DELETED" : "MEASUREMENTS SAVED");
          }}
        />
      )}
    </>
  );
}

function MeasurementForm({
  session,
  sessions,
  initialUnit,
  onClose,
  onSaved,
}: {
  session: TapeSession | null;
  sessions: TapeSession[];
  initialUnit: TapeUnit;
  onClose: () => void;
  onSaved: (unit: TapeUnit, deleted?: boolean) => void;
}) {
  const router = useRouter();
  const [id] = useState(() => session?.id ?? crypto.randomUUID());
  const [unit, setUnit] = useState<TapeUnit>(
    session?.input_unit ?? initialUnit,
  );
  const [date, setDate] = useState(session?.measured_on ?? localDayIso());
  const [note, setNote] = useState(session?.note ?? "");
  const [values, setValues] = useState<Partial<Record<TapeSiteKey, string>>>(
    () =>
      Object.fromEntries(
        (session?.readings ?? []).map((r) => [
          r.site_key,
          tapeValue(r.value_in, session?.input_unit ?? initialUnit),
        ]),
      ),
  );
  const [initial] = useState(() =>
    JSON.stringify({ date, note, values, unit }),
  );
  const [error, setError] = useState("");
  const [leaveHref, setLeaveHref] = useState<string | null | undefined>(
    undefined,
  );
  const [pending, startTransition] = useTransition();
  const dirty = initial !== JSON.stringify({ date, note, values, unit });
  useNavigationGuard(dirty || pending, (href) => {
    if (!pending) setLeaveHref(href);
  });
  function close() {
    if (pending) return;
    if (dirty) setLeaveHref(null);
    else onClose();
  }
  function changeUnit(next: TapeUnit) {
    if (next === unit) return;
    setValues(
      Object.fromEntries(
        Object.entries(values).map(([key, value]) => [
          key,
          value?.trim() && Number.isFinite(Number(value))
            ? String(
                Math.round(
                  fromInches(toInches(Number(value), unit), next) * 10000,
                ) / 10000,
              )
            : value,
        ]),
      ),
    );
    setUnit(next);
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const readings = TAPE_SITES.flatMap((s) => {
      const value = values[s.key]?.trim();
      return value
        ? [{ site_key: s.key, value_in: toInches(Number(value), unit) }]
        : [];
    });
    const parsed = tapeSessionSchema.safeParse({
      id,
      measured_on: date,
      input_unit: unit,
      note,
      readings,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    if (date > localDayIso()) {
      setError("That date hasn't happened yet.");
      return;
    }
    if (sessions.some((s) => s.measured_on === date && s.id !== id)) {
      setError(
        "There is already a session on that date. Edit that session instead.",
      );
      return;
    }
    startTransition(async () => {
      try {
        const result = await saveMeasurements({
          session: parsed.data,
          timezoneOffset: new Date().getTimezoneOffset(),
        });
        if (result.error) setError(result.error);
        else onSaved(unit);
      } catch {
        setError("Couldn't save. Your entries are still here. Try again.");
      }
    });
  }
  const groups = [...new Set(TAPE_SITES.map((s) => s.group))];
  function groupFields(optional: boolean) {
    return groups
      .filter(
        (g) => TAPE_SITES.find((s) => s.group === g)?.optional === optional,
      )
      .map((group) => {
        const sites = TAPE_SITES.filter((s) => s.group === group);
        return (
          <fieldset
            key={group}
            className="mt-5 border-t-[1.5px] border-ink pt-3"
          >
            <legend className={`${caps} pr-2`}>{group}</legend>
            <p className={`text-xs leading-relaxed ${muted}`}>
              {sites[0].guidance}
            </p>
            <div
              className={`mt-3 grid gap-3 ${sites.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}
            >
              {sites.map((site) => {
                const previous = siteHistory(
                  sessions.filter(
                    (s) => s.id !== session?.id && s.measured_on < date,
                  ),
                  site.key,
                ).at(-1);
                return (
                  <label key={site.key} className="block min-w-0">
                    <span className={`${caps} ${muted}`}>
                      {"side" in site ? site.side.toUpperCase() : "VALUE"} ·{" "}
                      {unit.toUpperCase()}
                    </span>
                    <input
                      aria-label={`${site.label} (${unit})`}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="—"
                      value={values[site.key] ?? ""}
                      disabled={pending}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [site.key]: e.target.value }))
                      }
                      className="numeral mt-1 min-h-12 w-full border border-ink/40 bg-paper px-3 text-right text-xl font-semibold focus:border-ink focus:outline-none"
                    />
                    <span
                      className={`mt-1 block text-[11px] leading-relaxed ${muted}`}
                    >
                      {previous
                        ? `Previous ${tapeValue(previous.valueIn, unit)} ${unit.toUpperCase()} · ${shortDateWithYear(previous.date)}`
                        : "No previous reading"}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      });
  }
  return (
    <>
      <BottomSheet
        open
        onClose={close}
        title={session ? "edit measurements" : "log measurements"}
        fullHeight
      >
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
            <p className={`text-sm leading-relaxed ${muted}`}>
              Measure relaxed, before training. Keep the tape level and snug
              without compressing the skin. Leave any site blank to skip it.
            </p>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className={`${caps} ${muted}`}>ENTRY UNITS</span>
              <UnitToggle
                unit={unit}
                onChange={changeUnit}
                disabled={pending}
              />
            </div>
            <label className={`${caps} mt-4 block`}>
              DATE
              <input
                type="date"
                required
                min="1900-01-01"
                max={localDayIso()}
                value={date}
                disabled={pending}
                onChange={(e) => setDate(e.target.value)}
                className="numeral mt-2 min-h-11 w-full border border-ink/40 bg-paper px-3 text-sm tracking-normal"
              />
            </label>
            {groupFields(false)}
            <details
              className="mt-5 border-y border-ink/15 py-3"
              open={
                session?.readings.some(
                  (r) => TAPE_SITES.find((s) => s.key === r.site_key)?.optional,
                ) || undefined
              }
            >
              <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">
                Hips, calves, neck &amp; forearms
              </summary>
              {groupFields(true)}
            </details>
            <label className={`${caps} mt-5 block`}>
              SESSION NOTE · OPTIONAL
              <textarea
                rows={2}
                maxLength={500}
                value={note}
                disabled={pending}
                onChange={(e) => setNote(e.target.value)}
                className="mt-2 w-full border border-ink/40 bg-paper p-3 text-sm font-normal tracking-normal"
              />
            </label>
            {session && (
              <button
                type="button"
                disabled={pending}
                className={`${caps} mt-4 min-h-11 underline underline-offset-4`}
                onClick={() => {
                  if (
                    !window.confirm(
                      "Delete this measurement session and all its readings? This cannot be undone.",
                    )
                  )
                    return;
                  startTransition(async () => {
                    try {
                      const result = await removeMeasurements(id);
                      if (result.error) setError(result.error);
                      else onSaved(unit, true);
                    } catch {
                      setError("Couldn't delete. Try again.");
                    }
                  });
                }}
              >
                DELETE SESSION
              </button>
            )}
          </div>
          <div className="shrink-0 border-t border-ink/15 pt-3">
            {error && (
              <p
                role="alert"
                className="mb-3 border border-ink p-3 text-sm leading-relaxed"
              >
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={pending}
              className={`${action} w-full bg-ink text-bg-base disabled:opacity-60`}
            >
              {pending ? "SAVING…" : "SAVE MEASUREMENTS"}
            </button>
            <button
              type="button"
              disabled={pending}
              className={`${caps} min-h-11 w-full`}
              onClick={close}
            >
              CANCEL
            </button>
          </div>
        </form>
      </BottomSheet>
      <LeaveConfirm
        open={leaveHref !== undefined}
        body="Your measurements haven't been saved."
        onKeepEditing={() => setLeaveHref(undefined)}
        onDiscard={() => {
          const href = leaveHref;
          setLeaveHref(undefined);
          onClose();
          if (href) router.push(href);
        }}
      />
    </>
  );
}
