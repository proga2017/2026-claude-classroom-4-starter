import {
  A2UI_OPERATIONS_KEY,
  type A2UIOperation,
  assembleOps,
} from "@ag-ui/a2ui-toolkit";
import type { TodoItem } from "@/lib/todo-tools";

/**
 * The one card the tutor can draw. Both ends of the wire name it: the tool
 * stamps these onto its `createSurface` operation, and components/a2ui-catalog
 * registers the catalog under the same id. A mismatch is not a styling bug —
 * the renderer throws "Catalog not found" and nothing paints.
 */
export const PROGRESS_CATALOG_ID = "ai-tutor://catalog/progress";
export const PROGRESS_SURFACE_ID = "todo-progress";

/**
 * Everything the card shows, computed from the rows. The shares are exact
 * fractions; the labels carry the rounded percentages, so the two never
 * disagree about what is displayed.
 */
export type ProgressFigures = {
  total: number;
  done: number;
  open: number;
  doneShare: number;
  openShare: number;
  doneLabel: string;
  openLabel: string;
};

/**
 * The card's component tree, authored once rather than generated per request.
 * Every figure arrives as a JSON Pointer into the surface's data model, so the
 * tree is a constant and the numbers are the only thing that varies — which is
 * also why no model ever has to produce one.
 *
 * `root` is not a name this file chose: the renderer starts every surface from
 * that id and paints a placeholder forever if it is missing.
 */
const PROGRESS_CARD: Array<Record<string, unknown>> = [
  { id: "root", component: "Card", child: "body" },
  { id: "body", component: "Column", children: ["heading", "bar", "open"] },
  {
    id: "heading",
    component: "Text",
    text: "Progress on your list",
    variant: "h4",
  },
  {
    id: "bar",
    component: "ProgressBar",
    value: { path: "/doneShare" },
    label: { path: "/doneLabel" },
  },
  { id: "open", component: "Text", text: { path: "/openLabel" } },
];

/**
 * Counts the rows and phrases them. The open percentage is derived from the
 * done one rather than rounded separately, so a third of a list reads
 * "33%" and "67%" instead of two figures that sum to 101.
 */
export function progressFigures(todos: TodoItem[]): ProgressFigures {
  const total = todos.length;
  const done = todos.filter((todo) => todo.done).length;
  const open = total - done;

  if (total === 0) {
    return {
      total,
      done,
      open,
      doneShare: 0,
      openShare: 0,
      doneLabel: "Nothing on the list yet",
      openLabel: "Nothing stands open",
    };
  }

  const donePercent = Math.round((done / total) * 100);

  return {
    total,
    done,
    open,
    doneShare: done / total,
    openShare: open / total,
    doneLabel: `${done} of ${total} done (${donePercent}%)`,
    openLabel: `${open} still open (${100 - donePercent}%)`,
  };
}

/** The A2UI v0.9 operations that paint the card: surface, tree, data. */
export function progressOperations(figures: ProgressFigures): A2UIOperation[] {
  return assembleOps({
    intent: "create",
    surfaceId: PROGRESS_SURFACE_ID,
    catalogId: PROGRESS_CATALOG_ID,
    components: PROGRESS_CARD,
    data: figures,
  });
}

/**
 * The envelope the A2UI middleware looks for in a tool result. Returned as an
 * object rather than its JSON text, because AG-UI already ships a tool result
 * as the JSON of whatever the tool returned (see lib/tool-result.ts).
 */
export function progressEnvelope(figures: ProgressFigures) {
  return { [A2UI_OPERATIONS_KEY]: progressOperations(figures) };
}
