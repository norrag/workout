import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  measurementImportArgs,
  normalizeMeasurementImport,
  previewMeasurementImport,
} from "@/lib/measure/tape-import";
import { getTapeSessions } from "@/lib/queries/measure/tape";
import { importTapeSessions } from "@/lib/queries/measure/import";
import { resolveSession, type McpExtra } from "../session";
import { toolResult } from "../envelope";
import { recordMcpWrite } from "../audit";
export const IMPORT_BODY_MEASUREMENTS = "import_body_measurements";
export function registerMeasurementImport(server: McpServer) {
  server.registerTool(
    IMPORT_BODY_MEASUREMENTS,
    {
      title: "Log or import body measurements",
      description:
        "Log new tape measurements or import dated history for the signed-in user. Supply explicit YYYY-MM-DD dates, units (in/cm), site keys and numeric values; never infer missing readings or dates. Up to 100 unique dates per atomic batch. Default commit:false previews without saving. After the user approves the values call commit:true. Unusual values require explicit confirm_unusual_values:true after review; these are typo checks, not medical limits. Exact existing sessions are unchanged; a conflicting date rejects the whole batch, never overwrites history. Correct existing entries in the app. Dates, unit, note and readings form the retry identity; retry the identical payload after an uncertain response. No user_id. Does not alter training prescriptions.",
      inputSchema: measurementImportArgs,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input: z.input<typeof measurementImportArgs>, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      const { args, sessions } = normalizeMeasurementImport(input);
      const history = await getTapeSessions(client, userId);
      const preview = previewMeasurementImport(sessions, history);
      if (
        args.commit &&
        preview.warnings.length &&
        !args.confirm_unusual_values
      ) {
        return toolResult({
          ok: false,
          error: {
            code: "REVIEW_VALUES",
            message:
              "Review unusual values, then confirm or correct them. Nothing saved.",
          },
          ...preview,
        });
      }
      const result = await importTapeSessions(client, sessions, args.commit);
      if (args.commit && result.sessions.some((s) => s.status === "inserted"))
        await recordMcpWrite(
          userId,
          IMPORT_BODY_MEASUREMENTS,
          args,
          `Imported ${result.sessions.filter((s) => s.status === "inserted").length} measurement sessions`,
        );
      return toolResult(
        {
          ...result,
          ...preview,
          canonical_sessions: sessions.map(
            ({ measured_on, input_unit, note, readings }) => ({
              measured_on,
              input_unit,
              note,
              readings,
            }),
          ),
        },
        { units: "in" },
      );
    },
  );
}
