import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { TAPE_SITES, siteHistory, type TapeSession } from "@/lib/measure/tape";
import { normalizeMeasurementImport } from "@/lib/measure/tape-import";
import {
  saveTapeSession,
  getTapeSessions,
  buildTapeExportCsv,
} from "@/lib/queries/measure/tape";
import { importTapeSessions } from "@/lib/queries/measure/import";
import { mutateTapeSession } from "@/lib/queries/measure/mutate";
import { formatBodyMeasurements } from "@/lib/mcp/tools/measurements";
import { measurementUpdateArgs } from "@/lib/mcp/tools/measurement-mutate";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error("Synthetic shoulder tests require local Supabase.");
async function user() {
  const c = createClient<Database>(
    url,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await c.auth.signUp({
    email: "shoulders-" + crypto.randomUUID() + "@integration.test",
    password: "test-password-123",
  });
  if (error) throw error;
  return { c, id: data.user!.id };
}
const readings = TAPE_SITES.map((s) => ({
  site_key: s.key,
  value_in: s.key === "shoulders" ? 48 : 20,
}));

describe("shoulder circumference through the shared measurement substrate", () => {
  it("saves/imports/edits all 13 sites, keeps old records sparse, exports deltas and enforces ownership", async () => {
    const { c, id } = await user();
    const other = await user();
    const legacy: TapeSession = {
      id: crypto.randomUUID(),
      measured_on: "2020-01-01",
      input_unit: "in",
      note: "synthetic legacy",
      readings: [{ site_key: "chest", value_in: 40 }],
    };
    await saveTapeSession(c, legacy);
    const full: TapeSession = {
      ...legacy,
      id: crypto.randomUUID(),
      measured_on: "2020-02-01",
      note: "synthetic shoulders",
      readings,
    };
    await saveTapeSession(c, full);
    expect(
      (await getTapeSessions(c, id)).find((s) => s.id === legacy.id),
    ).toEqual(legacy);
    const payload = normalizeMeasurementImport({
      sessions: [
        {
          date: "2020-03-01",
          unit: "cm",
          readings: readings.map((r) => ({
            site_key: r.site_key,
            value: (r.site_key === "shoulders" ? 49 : r.value_in) * 2.54,
          })),
        },
      ],
    }).sessions;
    await importTapeSessions(c, payload, false);
    expect(await getTapeSessions(c, id)).toHaveLength(2);
    await importTapeSessions(c, payload, true);
    let sessions = await getTapeSessions(c, id);
    const imported = sessions.find((s) => s.measured_on === "2020-03-01")!;
    expect(imported.readings).toHaveLength(13);
    const replacement: TapeSession = {
      ...imported,
      readings: imported.readings.map((r) =>
        r.site_key === "shoulders" ? { ...r, value_in: 49.5 } : r,
      ),
    };
    expect(
      measurementUpdateArgs.safeParse({
        session_id: imported.id,
        changes: {
          readings: replacement.readings.map((r) => ({
            site_key: r.site_key,
            value: r.value_in,
          })),
        },
      }).success,
    ).toBe(true);
    await mutateTapeSession(c, {
      id: imported.id,
      expected: imported,
      replacement,
      commit: true,
      delete: false,
      confirmDelete: false,
    });
    sessions = await getTapeSessions(c, id);
    const formatted = formatBodyMeasurements(sessions, "cm", false);
    expect(
      formatted.sites.find((s) => s.key === "shoulders")?.landmark,
    ).toContain("deltoids");
    expect(
      formatted.sessions[0].readings.find((r) => r.site_key === "shoulders"),
    ).toMatchObject({
      value: 125.73,
      delta: 3.81,
      previous_date: "2020-02-01",
      days_between: 29,
    });
    expect(siteHistory(sessions, "shoulders").map((r) => r.valueIn)).toEqual([
      48, 49.5,
    ]);
    expect(sessions.find((s) => s.id === legacy.id)).toEqual(legacy);
    expect(await buildTapeExportCsv(c, id)).toContain(
      "2020-03-01,shoulders,49.5,cm,",
    );
    expect(await getTapeSessions(other.c, id)).toEqual([]);
    await expect(
      mutateTapeSession(other.c, {
        id: imported.id,
        expected: replacement,
        replacement: imported,
        commit: true,
        delete: false,
        confirmDelete: false,
      }),
    ).rejects.toThrow();
    const overLimit = await c.rpc("save_measurement_session", {
      p_id: full.id,
      p_measured_on: full.measured_on,
      p_input_unit: "in",
      p_note: full.note,
      p_readings: [...readings, readings[0]],
    });
    expect(overLimit.error).not.toBeNull();
    expect(
      (await getTapeSessions(c, id)).find((s) => s.id === full.id)?.readings,
    ).toHaveLength(13);
  });
});
