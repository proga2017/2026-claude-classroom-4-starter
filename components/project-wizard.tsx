"use client";

import { A2UI_OPERATIONS_KEY, type A2UIOperation } from "@ag-ui/a2ui-toolkit";
import {
  A2UIProvider,
  A2UIRenderer,
  useA2UIActions,
} from "@copilotkit/a2ui-renderer";
import { CopilotKit, useAgent, useCopilotKit } from "@copilotkit/react-core/v2";
import { type FormEvent, useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { PROJECT_SURFACE_ID } from "@/lib/a2ui-project";
import { parseToolResult } from "@/lib/tool-result";

/** What `setProject` returns: the card, and the line that says what it set. */
const cardResult = z.object({
  [A2UI_OPERATIONS_KEY]: z.array(z.record(z.string(), z.unknown())),
  status: z.string(),
});

/**
 * Feeds one run's operations into the surrounding provider. Separate because
 * the actions are only reachable from inside it.
 */
function SurfaceOperations({ operations }: { operations: A2UIOperation[] }) {
  const { processMessages } = useA2UIActions();

  useEffect(() => {
    processMessages(operations);
  }, [operations, processMessages]);

  return null;
}

/**
 * The provider is the runtime client, not a chat: there is no CopilotChat and
 * no transcript on this page, and the card below is rendered by the page
 * itself. No `a2ui` prop either — passing a catalog would turn A2UI on for the
 * runtime and inject the model-composed `render_a2ui` tool beside the agent's
 * own, which this page has no use for.
 */
export function ProjectWizard({
  agentId,
  today,
}: {
  agentId: string;
  today: string;
}) {
  return (
    <CopilotKit runtimeUrl="/api/wizard" credentials="include">
      <Wizard agentId={agentId} today={today} />
    </CopilotKit>
  );
}

function Wizard({ agentId, today }: { agentId: string; today: string }) {
  const { agent, isReady } = useAgent({ agentId });
  const { copilotkit } = useCopilotKit();
  const [instruction, setInstruction] = useState("");
  const [status, setStatus] = useState("");
  const [running, setRunning] = useState(false);
  // `key` counts the runs: the provider below is remounted per card, which is
  // what lets each run recreate the surface from scratch.
  const [card, setCard] = useState<{
    key: number;
    operations: A2UIOperation[];
  } | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const asked = instruction.trim();
    if (!asked || running) return;

    setRunning(true);
    setStatus("Planning.");

    // One single-turn run per submit: the transcript is replaced rather than
    // appended to, and the agent holds no memory of the last one either.
    agent.setMessages([
      { id: crypto.randomUUID(), role: "user", content: asked },
    ]);

    try {
      const { newMessages } = await copilotkit.runAgent({ agent });
      const returned = newMessages.findLast(
        (message) => message.role === "tool",
      );
      const result = cardResult.safeParse(
        parseToolResult(returned?.content ?? ""),
      );

      if (!result.success) {
        setStatus("Nothing was set — say what the project is and try again.");
        return;
      }

      setCard((previous) => ({
        key: (previous?.key ?? 0) + 1,
        operations: result.data[A2UI_OPERATIONS_KEY],
      }));
      setStatus(result.data.status);
      setInstruction("");
    } catch {
      setStatus("The planner could not be reached. Try again.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Project card</h1>
        <p className="text-sm text-ink-mute">Planning as of {today}.</p>
      </div>

      {card ? (
        // Remounted on every run, so the surface is created afresh: the
        // processor rejects a second createSurface under an id it already
        // holds, and the edits made in the previous card go with it.
        <A2UIProvider key={card.key}>
          <SurfaceOperations operations={card.operations} />
          <A2UIRenderer surfaceId={PROJECT_SURFACE_ID} />
        </A2UIProvider>
      ) : (
        <p className="border border-edge bg-surface px-3 py-2 text-base text-ink-mute">
          Nothing planned yet. Describe the project below and the card appears
          here.
        </p>
      )}

      <form onSubmit={onSubmit} className="flex items-end gap-2">
        <div className="flex-1">
          <Field
            id="instruction"
            label="Instruction"
            className="w-full"
            autoComplete="off"
            placeholder="Relaunch the shop, starts next Monday, three weeks, two people full-time"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
          />
        </div>
        <Button type="submit" disabled={running || !isReady}>
          Send
        </Button>
      </form>
      <p aria-live="polite" className="min-h-5 text-sm text-ink-soft">
        {status}
      </p>
    </div>
  );
}
