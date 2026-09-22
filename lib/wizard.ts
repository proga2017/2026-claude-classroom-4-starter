import "server-only";
import { A2UI_OPERATIONS_KEY } from "@ag-ui/a2ui-toolkit";
import { Agent } from "@mastra/core/agent";
import { Mastra } from "@mastra/core/mastra";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { projectEnvelope } from "@/lib/a2ui-project";
import {
  applyProjectPatch,
  describeChanges,
  emptyProject,
  projectPatchSchema,
} from "@/lib/project";

/** Registry key of the wizard agent, and the CopilotKit `agentId` on the page. */
export const WIZARD_AGENT_ID = "wizard";

/**
 * The agent's one tool, and its whole output. It applies the patch to an empty
 * project — every run starts from one — and hands back the card that shows the
 * result, so the model neither reports the figures nor composes the surface.
 *
 * `status` travels beside the operations because the page shows it under the
 * card: the envelope is what the tool result carries, and the middleware key
 * is the only part of it A2UI cares about.
 */
export const setProject = createTool({
  id: "setProject",
  description:
    "Record the project the user described and draw their project card. Pass every field the instruction settles; the card is what the user sees, so this call is the whole answer.",
  inputSchema: projectPatchSchema,
  // Left loose because the shape is the A2UI wire format, which
  // lib/a2ui-project.ts owns.
  outputSchema: z.object({
    [A2UI_OPERATIONS_KEY]: z.array(z.record(z.string(), z.unknown())),
    status: z.string(),
  }),
  execute: async (patch) => {
    const { project, errors } = applyProjectPatch(emptyProject, patch);

    return {
      ...projectEnvelope(project),
      status: [describeChanges(emptyProject, project), ...Object.values(errors)]
        .join(" ")
        .trim(),
    };
  },
});

/** Today, as the model has to read it to work a relative date out. */
function today(now: Date) {
  const date = now.toISOString().slice(0, 10);
  const weekday = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    timeZone: "UTC",
  }).format(now);
  return `${date}, a ${weekday}`;
}

/**
 * Written for a small, literal model: the fields are named, the arithmetic is
 * spelled out, and one worked example carries the conventions the prose cannot
 * pin down — which day "next Monday" is, where a three-week span ends, and
 * that two full-time people over three weeks is 30 person-days.
 */
function instructions(now: Date) {
  return `You fill in one project card from one instruction, and the call to setProject is
your whole answer.

Call setProject exactly once, with every field the instruction settles, and stop there.
Do not write a reply beside it: the card the tool draws is what the user sees, and any
prose you add is discarded unread. Put the figures in the call, never in your reasoning
alone — a date you worked out and did not send is a date the user never gets.

Today is ${today(now)}. Every relative date is relative to that day.

The fields to derive:
- title: a short name for the project.
- description: one or two sentences on what it delivers.
- startDate, endDate: calendar dates, written YYYY-MM-DD.
- effortPersonDays: the whole team's effort in person-days. A full-time person contributes
  one person-day per working day; a week is five working days.
- criticality: low, medium, or high.

Worked example. Today is 2026-04-08, a Wednesday, and the instruction is "relaunch the
shop, starts next Monday, three weeks, two people full-time". Then startDate is 2026-04-13
(the next Monday), endDate is 2026-05-01 (three working weeks, ending on the Friday), and
effortPersonDays is 30 (two people over fifteen working days).

Leave a field out rather than inventing it. If the instruction settles nothing at all, call
setProject with no fields.`;
}

/**
 * The agent is built on every module evaluation rather than cached: it holds no
 * connection and no memory, so there is nothing to leak, and the instructions
 * carry the day the process started. `next dev` re-evaluates on every save; a
 * production process that runs past midnight is why `instructions` is a
 * function, which Mastra resolves per run.
 */
export const wizard = new Mastra({
  agents: {
    [WIZARD_AGENT_ID]: new Agent({
      id: WIZARD_AGENT_ID,
      name: "Project wizard",
      instructions: () => instructions(new Date()),
      // A small instruction-following model on purpose. A reasoning model works
      // the dates out while reasoning and then omits them from the tool call,
      // which is the one failure this whole page cannot survive.
      model: {
        id: "openrouter/google/gemini-3.1-flash-lite",
        // Same local-proxy escape hatch as the tutor's model; see lib/tutor.ts.
        ...(process.env.OPENROUTER_BASE_URL && {
          url: process.env.OPENROUTER_BASE_URL,
          apiKey: process.env.OPENROUTER_API_KEY,
        }),
      },
      // No memory: each submit is a single-turn run that starts from an empty
      // project, so there is nothing for a later run to remember.
      tools: { setProject },
    }),
  },
});
