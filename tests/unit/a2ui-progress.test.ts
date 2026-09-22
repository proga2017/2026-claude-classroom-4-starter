// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// The spec's own v0.9 message schema, so "well-formed" means what A2UI says it
// means rather than what this test remembers of it. It carries its own zod 3,
// which is why nothing here imports zod.
import { A2uiMessageListSchema } from "@a2ui/web_core/v0_9";
import { A2UI_OPERATIONS_KEY } from "@ag-ui/a2ui-toolkit";
import { migrate } from "drizzle-orm/libsql/migrator";
import { drizzle } from "drizzle-orm/libsql/node";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";

import {
  PROGRESS_CATALOG_ID,
  PROGRESS_SURFACE_ID,
  progressFigures,
} from "@/lib/a2ui-progress";
import * as schema from "@/lib/schema";
import { todos, user } from "@/lib/schema";
import { createTodoTools, tutorRequestContext } from "@/lib/todo-tools";

// Same shape as tests/unit/todo-tools.test.ts: the real statements, a throwaway
// file instead of data/app.db.
let dir: string;
let db: ReturnType<typeof drizzle<typeof schema>>;
let tools: ReturnType<typeof createTodoTools>;

const ada = tutorRequestContext("user-ada");
const grace = tutorRequestContext("user-grace");

type Operations = Record<string, unknown>[];

const runShowProgress = async (
  requestContext: ReturnType<typeof tutorRequestContext>,
) => {
  const result = (await (
    tools.showProgress.execute as unknown as (
      input: unknown,
      context: unknown,
    ) => Promise<Record<string, Operations>>
  )({}, { requestContext })) as Record<string, Operations>;
  return result[A2UI_OPERATIONS_KEY];
};

/** The operation carrying a given key, e.g. `createSurface`. */
const opFor = (operations: Operations, key: string) =>
  operations.find((operation) => key in operation)?.[key] as Record<
    string,
    unknown
  >;

const add = (title: string, done = false) =>
  db.insert(todos).values({ userId: "user-ada", title, done });

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "ai-tutor-a2ui-progress-"));
  db = drizzle({ connection: { url: `file:${join(dir, "test.db")}` }, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  tools = createTodoTools(db);

  await db.insert(user).values([
    { id: "user-ada", name: "Ada", email: "ada@example.com" },
    { id: "user-grace", name: "Grace", email: "grace@example.com" },
  ]);
});

afterAll(async () => {
  db.$client.close();
  await rm(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  await db.delete(todos);
});

test("the tool returns a well-formed A2UI v0.9 operations container", async () => {
  await add("Buy milk", true);
  await add("Write the chapter");

  const operations = await runShowProgress(ada);

  // Throws with the offending operation if the shape drifts.
  expect(() => A2uiMessageListSchema.parse(operations)).not.toThrow();
  expect(operations.map((operation) => Object.keys(operation).sort())).toEqual([
    ["createSurface", "version"],
    ["updateComponents", "version"],
    ["updateDataModel", "version"],
  ]);
  expect(opFor(operations, "createSurface")).toEqual({
    surfaceId: PROGRESS_SURFACE_ID,
    catalogId: PROGRESS_CATALOG_ID,
  });
});

test("the card's tree is a constant and carries no figure of its own", async () => {
  await add("Buy milk", true);
  await add("Write the chapter");
  const twoItems = await runShowProgress(ada);

  await add("Third errand");
  const threeItems = await runShowProgress(ada);

  expect(opFor(threeItems, "updateComponents")).toEqual(
    opFor(twoItems, "updateComponents"),
  );

  // The bar and the open line reach their values by pointer, not by literal.
  const components = (
    opFor(twoItems, "updateComponents") as {
      components: Record<string, unknown>[];
    }
  ).components;
  expect(components.find((node) => node.id === "bar")).toEqual({
    id: "bar",
    component: "ProgressBar",
    value: { path: "/doneShare" },
    label: { path: "/doneLabel" },
  });
  expect(components.find((node) => node.id === "open")).toEqual({
    id: "open",
    component: "Text",
    text: { path: "/openLabel" },
  });
  // The renderer starts every surface here; without it nothing paints.
  expect(components.some((node) => node.id === "root")).toBe(true);
});

test("the figures in the data model are the rows, counted", async () => {
  await add("Buy milk", true);
  await add("Post the letter", true);
  await add("Write the chapter");
  await add("Call the bank");

  const operations = await runShowProgress(ada);

  expect(opFor(operations, "updateDataModel")).toEqual({
    surfaceId: PROGRESS_SURFACE_ID,
    path: "/",
    value: {
      total: 4,
      done: 2,
      open: 2,
      doneShare: 0.5,
      openShare: 0.5,
      doneLabel: "2 of 4 done (50%)",
      openLabel: "2 still open (50%)",
    },
  });
});

test("the figures count only the calling student's rows", async () => {
  await add("Buy milk", true);
  await db
    .insert(todos)
    .values({ userId: "user-grace", title: "Grace's errand" });

  expect(
    (opFor(await runShowProgress(ada), "updateDataModel") as { value: unknown })
      .value,
  ).toMatchObject({ total: 1, done: 1, doneShare: 1 });
  expect(
    (
      opFor(await runShowProgress(grace), "updateDataModel") as {
        value: unknown;
      }
    ).value,
  ).toMatchObject({ total: 1, done: 0, doneShare: 0 });
});

test("an empty list reads as an empty list rather than as 0%", async () => {
  const operations = await runShowProgress(ada);

  expect(opFor(operations, "updateDataModel")).toMatchObject({
    value: {
      total: 0,
      doneShare: 0,
      openShare: 0,
      doneLabel: "Nothing on the list yet",
    },
  });
});

test("the two percentages always sum to 100, whatever the rounding", () => {
  const rows = (total: number, done: number) =>
    Array.from({ length: total }, (_, index) => ({
      id: `id-${index}`,
      title: `Item ${index}`,
      done: index < done,
    }));

  for (let total = 1; total <= 12; total++) {
    for (let done = 0; done <= total; done++) {
      const { doneLabel, openLabel } = progressFigures(rows(total, done));
      const percent = (label: string) => Number(label.match(/\((\d+)%\)/)?.[1]);

      expect(percent(doneLabel) + percent(openLabel)).toBe(100);
    }
  }
});
