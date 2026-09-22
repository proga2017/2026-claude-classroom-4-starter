// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { migrate } from "drizzle-orm/libsql/migrator";
import { drizzle } from "drizzle-orm/libsql/node";
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";

import { createTodoMcpServer, TODO_FORM_URI } from "@/lib/mcp-server";
import * as schema from "@/lib/schema";
import { todos, user } from "@/lib/schema";

// The built view lives in the git-ignored mcp-apps/dist, which a clean
// checkout does not have; tests/unit/mcp-app-views.test.ts covers the reader
// itself, so here it only has to answer with something recognisable.
vi.mock("@/lib/mcp-app-views", () => ({
  readView: vi.fn(async (name: string) => `<!doctype html><p>${name}</p>`),
}));

// The real server over a throwaway file, as tests/unit/todo-tools.test.ts runs
// the agent tools: one client per user, which is what a verified access token
// gets in app/api/mcp/route.ts.
let dir: string;
let db: ReturnType<typeof drizzle<typeof schema>>;
let ada: Client;
let grace: Client;

async function connect(userId: string) {
  const client = new Client({ name: "test", version: "0.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    client.connect(clientTransport),
    createTodoMcpServer(db, userId).connect(serverTransport),
  ]);
  return client;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "ai-tutor-mcp-server-"));
  db = drizzle({ connection: { url: `file:${join(dir, "test.db")}` }, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });

  // todos.userId is a FK onto the Better Auth user table.
  await db.insert(user).values([
    { id: "user-ada", name: "Ada", email: "ada@example.com" },
    { id: "user-grace", name: "Grace", email: "grace@example.com" },
  ]);

  ada = await connect("user-ada");
  grace = await connect("user-grace");
});

afterAll(async () => {
  await Promise.all([ada.close(), grace.close()]);
  db.$client.close();
  await rm(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  await db.delete(todos);
});

test("open_todo_form links to its ui resource and takes an optional title", async () => {
  const { tools } = await ada.listTools();
  const form = tools.find((tool) => tool.name === "open_todo_form");

  expect(form?._meta?.ui).toMatchObject({ resourceUri: TODO_FORM_URI });
  expect(form?.inputSchema.properties).toHaveProperty("title");
  expect(form?.inputSchema.required ?? []).not.toContain("title");
});

test("the ui resource serves the built view as an MCP App", async () => {
  const { contents } = await ada.readResource({ uri: TODO_FORM_URI });

  expect(contents[0]).toMatchObject({
    uri: TODO_FORM_URI,
    mimeType: RESOURCE_MIME_TYPE,
    text: expect.stringContaining("todo-form"),
  });
});

test("submit_todo_form is the form's own tool, off limits to the model", async () => {
  const { tools } = await ada.listTools();
  const submit = tools.find((tool) => tool.name === "submit_todo_form");

  expect(submit?._meta?.ui).toMatchObject({
    resourceUri: TODO_FORM_URI,
    visibility: ["app"],
  });
});

test("opening the form reports the open to-dos it lists", async () => {
  await ada.callTool({ name: "add_todo", arguments: { title: "Buy milk" } });
  const { id } = (
    (await ada.callTool({
      name: "add_todo",
      arguments: { title: "Call Grace" },
    })) as { structuredContent: { todo: { id: string } } }
  ).structuredContent.todo;
  await ada.callTool({ name: "mark_todo_done", arguments: { id } });

  const result = await ada.callTool({
    name: "open_todo_form",
    arguments: { title: "Buy bread" },
  });

  expect(result.structuredContent).toEqual({
    openTodos: [{ id: expect.any(String), title: "Buy milk", done: false }],
  });
});

test("submit_todo_form saves for the user the server was built for", async () => {
  const result = await ada.callTool({
    name: "submit_todo_form",
    arguments: { title: "  Buy milk  " },
  });

  expect(result.isError).toBeFalsy();
  expect(result.structuredContent).toEqual({
    todo: { id: expect.any(String), title: "Buy milk", done: false },
    openTodos: [{ id: expect.any(String), title: "Buy milk", done: false }],
  });
  // Grace's own server reads her own list, so the item is not merely hidden
  // from her by a filter on the way out — it was never hers.
  await expect(
    grace.callTool({ name: "list_todos", arguments: {} }),
  ).resolves.toMatchObject({ structuredContent: { todos: [] } });
});

test("submit_todo_form refuses a title that is only whitespace", async () => {
  // An error result rather than a thrown one, which is what the view shows in
  // its status line; `CreateTodoRequest` trims before it counts characters.
  const result = await ada.callTool({
    name: "submit_todo_form",
    arguments: { title: "   " },
  });

  expect(result.isError).toBe(true);
  expect(JSON.stringify(result.content)).toContain("title");
  await expect(db.select().from(todos)).resolves.toEqual([]);
});
