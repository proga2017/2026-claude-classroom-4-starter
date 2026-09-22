import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/server";
import {
  CreateTodoRequest,
  mcpToolResult,
  mcpTools,
  Todo,
} from "ai-tutor-api-contract";
import { z } from "zod";
import { readView } from "@/lib/mcp-app-views";
import {
  addTodoFor,
  listOpenTodosFor,
  listTodosFor,
  setTodoDoneFor,
  type TodoDb,
} from "@/lib/todo-tools";

/**
 * The `ui://` resource `open_todo_form` points at. The host reads it back from
 * this same server, so the path only has to be unique within it.
 */
export const TODO_FORM_URI = "ui://ai-tutor/todo-form.html";

/**
 * What both form tools report back. The view draws the open list from it, so
 * the shape is part of the contract between mcp-apps/todo-form/view.ts and
 * this file; `todo` is the item just saved, which opening the form has not.
 */
const todoFormResult = z.object({
  todo: Todo.optional(),
  openTodos: z.array(Todo),
});

/**
 * The `ai-tutor mcp --stdio` tools served from inside the app: same names,
 * descriptions, and schemas (from the contract), but straight onto the todos
 * table instead of through /api/todos — plus `open_todo_form`, which the CLI
 * has no way to draw. `userId` is fixed when the server is built, and
 * app/api/mcp/route.ts builds one per request from the verified access token,
 * so no tool argument can name another user's list.
 */
export function createTodoMcpServer(db: TodoDb, userId: string) {
  const server = new McpServer({ name: "ai-tutor", version: "0.1.0" });

  server.registerTool("list_todos", mcpTools.list_todos, async ({ q }) =>
    mcpToolResult({ todos: await listTodosFor(db, userId, q) }),
  );

  server.registerTool("add_todo", mcpTools.add_todo, async ({ title }) =>
    mcpToolResult({ todo: await addTodoFor(db, userId, title) }),
  );

  server.registerTool(
    "mark_todo_done",
    mcpTools.mark_todo_done,
    async ({ id }) => {
      const todo = await setTodoDoneFor(db, userId, id, true);
      // Thrown errors become `isError` results; another user's id reads as
      // unknown, same as PATCH /api/todos/:id answering 404.
      if (!todo) throw new Error(`not_found: no to-do with id ${id}`);
      return mcpToolResult({ todo });
    },
  );

  /**
   * The form's two tools stay out of the contract's `mcpTools`: `ai-tutor mcp
   * --stdio` registers everything in there, and a terminal has no iframe to
   * draw a form in.
   *
   * Opening one is the model's move, and `title` is optional so it may draft
   * the item; the user still types over it before adding.
   */
  registerAppTool(
    server,
    "open_todo_form",
    {
      title: "Open the to-do form",
      description:
        "Show the user a form for a new to-do, filled in with `title` if you pass one. Adding is the user's own click, so this tool changes nothing on its own — use add_todo to put an item on the list yourself.",
      inputSchema: z.object({
        title: z
          .string()
          .trim()
          .optional()
          .describe("A draft the user sees in the field and can overwrite."),
      }),
      outputSchema: todoFormResult,
      _meta: { ui: { resourceUri: TODO_FORM_URI } },
    },
    async ({ title }) => ({
      // A host without UI gets this text and nothing else, so it has to read
      // as the whole outcome rather than as a caption to a form it cannot see.
      content: [
        {
          type: "text" as const,
          text: title
            ? `Asked the user to add "${title}" — nothing is on the list until they do.`
            : "Asked the user for a new to-do — nothing is on the list until they add one.",
        },
      ],
      // The form lists these under its field, so they travel with the result
      // that opens it rather than costing the view a call of its own.
      structuredContent: { openTodos: await listOpenTodosFor(db, userId) },
    }),
  );

  /**
   * The form's save, and the one tool no model may call: `visibility: ["app"]`
   * keeps it out of the model's tool list, so an item reaches the list only
   * through the button the user clicked. The title is the contract's own, so
   * the form rejects what `POST /api/todos` would reject.
   */
  registerAppTool(
    server,
    "submit_todo_form",
    {
      title: "Save the to-do form",
      description:
        "Save the to-do the user typed into the form and report the list back to it.",
      inputSchema: CreateTodoRequest,
      outputSchema: todoFormResult,
      _meta: { ui: { resourceUri: TODO_FORM_URI, visibility: ["app"] } },
    },
    async ({ title }) => {
      const todo = await addTodoFor(db, userId, title);
      return mcpToolResult({
        todo,
        openTodos: await listOpenTodosFor(db, userId),
      });
    },
  );

  registerAppResource(
    server,
    "New to-do form",
    TODO_FORM_URI,
    { description: "The form open_todo_form shows in the host's chat." },
    async () => ({
      contents: [
        {
          uri: TODO_FORM_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: await readView("todo-form"),
        },
      ],
    }),
  );

  return server;
}
