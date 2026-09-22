import {
  A2UI_OPERATIONS_KEY,
  type A2UIOperation,
  assembleOps,
  BASIC_CATALOG_ID,
} from "@ag-ui/a2ui-toolkit";
import { criticalities, type Project } from "@/lib/project";

/**
 * The project card the wizard agent draws. It adds no component of its own, so
 * it names A2UI's basic catalog rather than one this app registers — which is
 * also the id `A2UIProvider` falls back to when the page hands it no catalog,
 * so the two ends match without a constant of ours in between.
 */
export const PROJECT_CATALOG_ID = BASIC_CATALOG_ID;
export const PROJECT_SURFACE_ID = "project-card";

/**
 * The project as the surface's data model holds it. Two fields change shape on
 * the way in because the basic catalog declares their bindings that way:
 * `TextField` binds a string, so the effort travels as text, and
 * `ChoicePicker` binds the list of selected values, so the criticality travels
 * as a one-element list.
 */
export type ProjectFields = {
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  effortPersonDays: string;
  criticality: string[];
};

/**
 * The card's component tree, authored once rather than generated per request —
 * the same bargain as lib/a2ui-progress.ts. Every field arrives as a JSON
 * Pointer into the data model, and the inputs write back down the same pointer,
 * so the tree is a constant and no model ever has to produce one.
 *
 * `root` is not a name this file chose: the renderer starts every surface from
 * that id and paints a placeholder forever if it is missing.
 */
const PROJECT_CARD: Array<Record<string, unknown>> = [
  { id: "root", component: "Card", child: "body" },
  {
    id: "body",
    component: "Column",
    children: ["title", "description", "start", "end", "effort", "criticality"],
  },
  {
    id: "title",
    component: "TextField",
    label: "Title",
    value: { path: "/title" },
  },
  {
    id: "description",
    component: "TextField",
    label: "Description",
    variant: "longText",
    value: { path: "/description" },
  },
  {
    id: "start",
    component: "DateTimeInput",
    label: "Start date",
    enableDate: true,
    value: { path: "/startDate" },
  },
  {
    id: "end",
    component: "DateTimeInput",
    label: "End date",
    enableDate: true,
    value: { path: "/endDate" },
  },
  {
    id: "effort",
    component: "TextField",
    label: "Effort in person-days",
    variant: "number",
    value: { path: "/effortPersonDays" },
  },
  {
    id: "criticality",
    component: "ChoicePicker",
    label: "Criticality",
    variant: "mutuallyExclusive",
    options: criticalities.map((value) => ({
      label: `${value[0].toUpperCase()}${value.slice(1)}`,
      value,
    })),
    value: { path: "/criticality" },
  },
];

/** The project, in the shapes the card's bindings expect. */
export function projectFields(project: Project): ProjectFields {
  return {
    title: project.title,
    description: project.description,
    startDate: project.startDate,
    endDate: project.endDate,
    // An unset effort reads as an empty field rather than as a planned zero.
    effortPersonDays:
      project.effortPersonDays > 0 ? String(project.effortPersonDays) : "",
    criticality: [project.criticality],
  };
}

/** The A2UI v0.9 operations that paint the card: surface, tree, data. */
export function projectOperations(project: Project): A2UIOperation[] {
  return assembleOps({
    intent: "create",
    surfaceId: PROJECT_SURFACE_ID,
    catalogId: PROJECT_CATALOG_ID,
    components: PROJECT_CARD,
    data: projectFields(project),
  });
}

/**
 * The envelope the page looks for in the tool result. Returned as an object
 * rather than its JSON text, because AG-UI already ships a tool result as the
 * JSON of whatever the tool returned (see lib/tool-result.ts).
 */
export function projectEnvelope(project: Project) {
  return { [A2UI_OPERATIONS_KEY]: projectOperations(project) };
}
