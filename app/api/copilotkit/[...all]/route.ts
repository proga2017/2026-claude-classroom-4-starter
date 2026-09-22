import { MastraAgent } from "@ag-ui/mastra";
import {
  CopilotRuntime,
  createCopilotRuntimeHandler,
} from "@copilotkit/runtime/v2";
import { auth } from "@/lib/auth";
import { tutorRequestContext } from "@/lib/todo-tools";
import { mastra, TUTOR_AGENT_ID } from "@/lib/tutor";

const basePath = "/api/copilotkit";

async function handler(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // The whole isolation story: `resourceId` is the verified user id and is
  // never read from the request, so the memory Mastra loads and writes belongs
  // to the caller by construction. Built per request, hence the runtime is too.
  // The same verified id reaches the todo tools through the RequestContext.
  // The bridge forwards whatever the browser sent under a separate "ag-ui"
  // key, so `userId` here cannot be overwritten from the wire.
  const agent = MastraAgent.getLocalAgent({
    mastra,
    agentId: TUTOR_AGENT_ID,
    resourceId: session.user.id,
    requestContext: tutorRequestContext(session.user.id),
  });

  // A2UI is on so the middleware turns the `showProgress` tool's operations
  // into a rendered surface, and `injectA2UITool: true` has it add `render_a2ui`
  // beside them, with its usage guidelines, so the model can compose a surface
  // of its own for anything the fixed card in lib/a2ui-progress.ts does not
  // cover. Both paths render through the same catalog.
  const runtime = new CopilotRuntime({
    agents: { [TUTOR_AGENT_ID]: agent },
    a2ui: { injectA2UITool: true },
  });

  return createCopilotRuntimeHandler({ runtime, basePath })(request);
}

export const GET = handler;
export const POST = handler;
