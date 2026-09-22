// @vitest-environment node
// The spec's own v0.9 message schema, so "well-formed" means what A2UI says it
// means rather than what this test remembers of it. It carries its own zod 3,
// which is why nothing here imports zod.
import { A2uiMessageListSchema } from "@a2ui/web_core/v0_9";
import { A2UI_OPERATIONS_KEY } from "@ag-ui/a2ui-toolkit";
import { expect, test, vi } from "vitest";

// The `server-only` package resolves to its throwing build outside Next.js;
// nothing here needs what it guards. No model call happens on import.
vi.mock("server-only", () => ({}));

import { PROJECT_CATALOG_ID, PROJECT_SURFACE_ID } from "@/lib/a2ui-project";
import type { ProjectPatch } from "@/lib/project";
import { setProject } from "@/lib/wizard";

type Operations = Record<string, unknown>[];
type Result = { [A2UI_OPERATIONS_KEY]: Operations; status: string };

const run = (patch: ProjectPatch) =>
  (
    setProject.execute as unknown as (
      input: ProjectPatch,
      context: unknown,
    ) => Promise<Result>
  )(patch, {});

/** The operation carrying a given key, e.g. `createSurface`. */
const opFor = (operations: Operations, key: string) =>
  operations.find((operation) => key in operation)?.[key] as Record<
    string,
    unknown
  >;

const planned: ProjectPatch = {
  title: "Shop relaunch",
  description: "Rebuild the storefront on the new platform.",
  startDate: "2026-04-13",
  endDate: "2026-05-01",
  effortPersonDays: 30,
  criticality: "high",
};

test("the tool returns a well-formed A2UI v0.9 operations container", async () => {
  const { [A2UI_OPERATIONS_KEY]: operations } = await run(planned);

  // Throws with the offending operation if the shape drifts.
  expect(() => A2uiMessageListSchema.parse(operations)).not.toThrow();
  expect(operations.map((operation) => Object.keys(operation).sort())).toEqual([
    ["createSurface", "version"],
    ["updateComponents", "version"],
    ["updateDataModel", "version"],
  ]);
  expect(opFor(operations, "createSurface")).toEqual({
    surfaceId: PROJECT_SURFACE_ID,
    catalogId: PROJECT_CATALOG_ID,
  });
});

test("the card's tree is a constant and carries no value of its own", async () => {
  const full = (await run(planned))[A2UI_OPERATIONS_KEY];
  const partial = (await run({ title: "Something else" }))[A2UI_OPERATIONS_KEY];

  expect(opFor(partial, "updateComponents")).toEqual(
    opFor(full, "updateComponents"),
  );

  const components = (
    opFor(full, "updateComponents") as { components: Record<string, unknown>[] }
  ).components;
  // Every field reaches its value by pointer, and writes back down the same
  // one — the inputs are bound, not pre-filled.
  expect(components.find((node) => node.id === "effort")).toEqual({
    id: "effort",
    component: "TextField",
    label: "Effort in person-days",
    variant: "number",
    value: { path: "/effortPersonDays" },
  });
  // The renderer starts every surface here; without it nothing paints.
  expect(components.some((node) => node.id === "root")).toBe(true);
});

test("the data model is the patch, applied to an empty project", async () => {
  const { [A2UI_OPERATIONS_KEY]: operations, status } = await run(planned);

  expect(opFor(operations, "updateDataModel")).toEqual({
    surfaceId: PROJECT_SURFACE_ID,
    path: "/",
    value: {
      title: "Shop relaunch",
      description: "Rebuild the storefront on the new platform.",
      startDate: "2026-04-13",
      endDate: "2026-05-01",
      // Text, because the field it binds is a TextField…
      effortPersonDays: "30",
      // …and a list, because a ChoicePicker binds its selection.
      criticality: ["high"],
    },
  });
  expect(status).toBe(
    'Set title to "Shop relaunch", description to "Rebuild the storefront on the new platfo...", start date to 2026-04-13, end date to 2026-05-01, effort to 30 person-days and criticality to high.',
  );
});

test("a field the patch leaves out stays empty, and each run starts over", async () => {
  const { [A2UI_OPERATIONS_KEY]: operations, status } = await run({
    title: "Just a name",
  });

  expect(opFor(operations, "updateDataModel")).toMatchObject({
    value: {
      title: "Just a name",
      description: "",
      startDate: "",
      endDate: "",
      // An unset effort is an empty field rather than a planned zero.
      effortPersonDays: "",
      criticality: ["medium"],
    },
  });
  expect(status).toBe('Set title to "Just a name".');
});

test("a field that breaks a rule keeps the others and says so", async () => {
  const { [A2UI_OPERATIONS_KEY]: operations, status } = await run({
    title: "Shop relaunch",
    startDate: "next Monday",
    effortPersonDays: 0,
  });

  expect(opFor(operations, "updateDataModel")).toMatchObject({
    value: { title: "Shop relaunch", startDate: "", effortPersonDays: "" },
  });
  expect(status).toBe(
    'Set title to "Shop relaunch". Effort has to be more than zero person-days. "next Monday" is not a date. Use the form 2026-04-13.',
  );
});
