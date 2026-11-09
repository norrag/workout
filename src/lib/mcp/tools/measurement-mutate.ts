import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { tapeSessionSchema, TAPE_SITES, fromInches } from "@/lib/measure/tape";
import {
  normalizeMeasurementImport,
  previewMeasurementImport,
} from "@/lib/measure/tape-import";
import { getTapeSessions } from "@/lib/queries/measure/tape";
import { mutateTapeSession } from "@/lib/queries/measure/mutate";
import { resolveSession, type McpExtra } from "../session";
import { toolResult } from "../envelope";
import { recordMcpWrite } from "../audit";

const common = {
  session_id: z.uuid(),
  expected_session: tapeSessionSchema
    .optional()
    .describe(
      "Unmodified canonical snapshot returned by a fresh preview. Required to commit; values are inches.",
    ),
  commit: z.boolean().default(false),
};
export const measurementUpdateArgs = z
  .object({
    ...common,
    changes: z
      .object({
        date: z.iso.date().optional(),
        unit: z.enum(["in", "cm"]).optional(),
        note: z.string().trim().max(500).optional(),
        readings: z
          .array(
            z
              .object({
                site_key: z.enum(TAPE_SITES.map((s) => s.key)),
                value: z.number().finite().positive().max(381),
              })
              .strict(),
          )
          .min(1)
          .max(12)
          .optional(),
      })
      .strict()
      .refine((v) => Object.keys(v).length > 0, "Supply at least one change."),
    utc_offset_minutes: z.number().int().min(-840).max(840).default(0),
    confirm_unusual_values: z.boolean().default(false),
  })
  .strict();
export const measurementDeleteArgs = z
  .object({
    ...common,
    confirm_delete: z
      .boolean()
      .default(false)
      .describe(
        "Set true only after the user confirms permanent deletion of the specific session shown in preview.",
      ),
  })
  .strict();

function validateExpected(
  id: string,
  expected: z.infer<typeof tapeSessionSchema> | undefined,
  commit: boolean,
) {
  if (commit && !expected)
    throw new Error(
      "Preview first and supply expected_session unchanged to commit.",
    );
  if (expected && expected.id !== id)
    throw new Error("Expected snapshot must match session_id.");
}
export function registerMeasurementMutations(server: McpServer) {
  server.registerTool(
    "update_body_measurements",
    {
      title: "Update a body measurement session",
      description:
        "Correct your own existing tape session by session_id. Default preview changes nothing; return expected_session unchanged with commit:true after approval. Omitted fields stay unchanged. readings, when supplied, replaces the complete site's list: omitted sites are removed, so show removed_sites to the user first. Values use changes.unit, or the session's recorded unit if omitted. Changing only unit preserves physical measurements. Can correct dates, notes and individual or multiple readings. Changed or missing records and date conflicts reject without overwriting. Never invent missing measurements. Unusual values require explicit review/confirmation. No user_id; no training prescription changes.",
      inputSchema: measurementUpdateArgs,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input: z.input<typeof measurementUpdateArgs>, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      const args = measurementUpdateArgs.parse(input);
      validateExpected(args.session_id, args.expected_session, args.commit);
      const history = await getTapeSessions(client, userId);
      const current = history.find((s) => s.id === args.session_id);
      if (!current) throw new Error("Measurement session not found.");
      const expected = args.expected_session ?? current;
      const unit = args.changes.unit ?? expected.input_unit;
      const { sessions } = normalizeMeasurementImport({
        sessions: [
          {
            date: args.changes.date ?? expected.measured_on,
            unit,
            note: args.changes.note ?? expected.note,
            readings:
              args.changes.readings ??
              expected.readings.map((r) => ({
                site_key: r.site_key,
                value: fromInches(r.value_in, unit),
              })),
          },
        ],
        utc_offset_minutes: args.utc_offset_minutes,
      });
      const replacement = { ...sessions[0], id: args.session_id };
      const preview = previewMeasurementImport(
        [replacement],
        history.filter((s) => s.id !== args.session_id),
      );
      const removed_sites = expected.readings
        .filter(
          (r) => !replacement.readings.some((n) => n.site_key === r.site_key),
        )
        .map((r) => r.site_key);
      if (
        args.commit &&
        preview.warnings.length &&
        !args.confirm_unusual_values
      )
        return toolResult(
          {
            ok: false,
            error: {
              code: "REVIEW_VALUES",
              message: "Review unusual values before saving.",
            },
            ...preview,
            expected_session: expected,
            proposed_session: replacement,
            removed_sites,
          },
          { units: "in" },
        );
      const result = await mutateTapeSession(client, {
        id: args.session_id,
        expected,
        replacement,
        commit: args.commit,
        delete: false,
        confirmDelete: false,
      });
      if (args.commit && result.status === "updated")
        await recordMcpWrite(
          userId,
          "update_body_measurements",
          args,
          "Updated one measurement session",
        );
      return toolResult(
        {
          ...result,
          ...preview,
          expected_session: expected,
          proposed_session: replacement,
          removed_sites,
        },
        { units: "in" },
      );
    },
  );
  server.registerTool(
    "delete_body_measurements",
    {
      title: "Delete a body measurement session",
      description:
        "Permanently delete one of your own tape sessions and all its readings. No bulk deletion. Preview first with session_id; show the returned exact date and readings and obtain action-time user confirmation of permanent deletion. Then supply expected_session unchanged, commit:true and confirm_delete:true. Omitted confirmation, changed snapshot, missing session or another owner's ID rejects without deleting. Default preview performs no writes. This cannot be undone through the app. No user_id; no other body data or training records are changed.",
      inputSchema: measurementDeleteArgs,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input: z.input<typeof measurementDeleteArgs>, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      const args = measurementDeleteArgs.parse(input);
      validateExpected(args.session_id, args.expected_session, args.commit);
      if (args.commit && !args.confirm_delete)
        throw new Error(
          "Confirm permanent deletion of this session before committing.",
        );
      const current = (await getTapeSessions(client, userId)).find(
        (s) => s.id === args.session_id,
      );
      if (!current) throw new Error("Measurement session not found.");
      const expected = args.expected_session ?? current;
      const result = await mutateTapeSession(client, {
        id: args.session_id,
        expected,
        commit: args.commit,
        delete: true,
        confirmDelete: args.confirm_delete,
      });
      if (args.commit && result.status === "deleted")
        await recordMcpWrite(
          userId,
          "delete_body_measurements",
          args,
          "Deleted one measurement session",
        );
      return toolResult(
        { ...result, expected_session: expected, permanent: true },
        { units: "in" },
      );
    },
  );
}
