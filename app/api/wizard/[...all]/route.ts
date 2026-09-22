import { MastraAgent } from "@ag-ui/mastra";
import {
  CopilotRuntime,
  createCopilotRuntimeHandler,
} from "@copilotkit/runtime/v2";
import { auth } from "@/lib/auth";
import { WIZARD_AGENT_ID, wizard } from "@/lib/wizard";

const basePath = "/api/wizard";

async function handler(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // The agent keeps no memory, so `resourceId` scopes nothing here — it is the
  // verified user id all the same, because a run should never be attributable
  // to anyone but its caller.
  const agent = MastraAgent.getLocalAgent({
    mastra: wizard,
    agentId: WIZARD_AGENT_ID,
    resourceId: session.user.id,
  });

  // Deliberately no `a2ui` on this runtime, unlike the chat's. The card's
  // operations are the tool's own result and the page renders them itself, so
  // there is no middleware to intercept them — and no injected `render_a2ui`,
  // which would offer this agent a second, model-composed surface it has no
  // use for.
  const runtime = new CopilotRuntime({ agents: { [WIZARD_AGENT_ID]: agent } });

  return createCopilotRuntimeHandler({ runtime, basePath })(request);
}

export const GET = handler;
export const POST = handler;
