import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { getTapeSessions } from "@/lib/queries/measure/tape";
import {
  daySpan,
  fromInches,
  TAPE_SITES,
  type TapeSession,
  type TapeUnit,
} from "@/lib/measure/tape";
import { toolResult } from "../envelope";
import { resolveSession, type McpExtra } from "../session";

export const GET_BODY_MEASUREMENTS = "get_body_measurements";
export const bodyMeasurementArgs = z
  .object({
    unit: z.enum(["in", "cm"]).default("in"),
    limit: z.number().int().min(1).max(120).default(24),
    before: z.iso.date().optional(),
  })
  .strict();

/** Deltas use only earlier same-site observations in this returned page. */
export function formatBodyMeasurements(
  sessions: TapeSession[],
  unit: TapeUnit,
  hasMore: boolean,
) {
  const previous = new Map<string, { date: string; valueIn: number }>();
  const number = (inches: number) => {
    const rounded = Math.round(fromInches(inches, unit) * 100) / 100;
    return Object.is(rounded, -0) ? 0 : rounded;
  };
  const chronological = [...sessions].sort((a, b) =>
    a.measured_on.localeCompare(b.measured_on),
  );
  const rows = chronological
    .map((s) => ({
      session_id: s.id,
      date: s.measured_on,
      recorded_unit: s.input_unit,
      note: s.note,
      readings: s.readings.map((r) => {
        const prior = previous.get(r.site_key);
        previous.set(r.site_key, { date: s.measured_on, valueIn: r.value_in });
        return {
          site_key: r.site_key,
          value: number(r.value_in),
          previous_date: prior?.date ?? null,
          previous_value: prior ? number(prior.valueIn) : null,
          delta: prior ? number(r.value_in - prior.valueIn) : null,
          days_between: prior ? daySpan(prior.date, s.measured_on) : null,
        };
      }),
    }))
    .reverse();
  return {
    unit,
    session_count: rows.length,
    has_more: hasMore,
    next_before: hasMore ? (chronological[0]?.measured_on ?? null) : null,
    sessions: rows,
    sites: TAPE_SITES.map((s) => ({
      key: s.key,
      label: s.label,
      landmark: s.guidance,
    })),
    guardrails: {
      method:
        "Raw tape readings, rounded to 2 display decimals. Deltas compare the same site and side within this returned page; the first returned reading has no baseline.",
      interpretation:
        "Placement, breathing and hydration can affect readings. Circumference alone does not distinguish muscle from fat. Compare dates and coverage with strength and DEXA; DEXA also has measurement limits.",
      missing:
        "Skipped sites have no value or delta. Nothing is interpolated or carried forward. No score, body-composition estimate or prescription input is produced.",
    },
  };
}

export function registerMeasurementTools(server: McpServer) {
  server.registerTool(
    GET_BODY_MEASUREMENTS,
    {
      title: "Get body measurements",
      description:
        "Read the signed-in user's dated tape-measurement sessions and same-site/side deltas, with baseline dates and intervals. Optional inches/cm, limit (default 24, max 120) and exclusive before date for older pages. Missing stays missing. Read the guardrails before interpreting; tape does not identify muscle/fat or alter prescriptions. Read-only; no user_id argument.",
      inputSchema: bodyMeasurementArgs,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input: z.input<typeof bodyMeasurementArgs>, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      const args = bodyMeasurementArgs.parse(input);
      const rows = await getTapeSessions(client, userId, {
        before: args.before,
        limit: args.limit + 1,
      });
      return toolResult(
        formatBodyMeasurements(
          rows.slice(0, args.limit),
          args.unit,
          rows.length > args.limit,
        ),
        {
          units: args.unit,
          dataQuality: {
            source:
              "Owner-scoped measurement_sessions + measurements; raw same-site observations only",
          },
        },
      );
    },
  );
}
