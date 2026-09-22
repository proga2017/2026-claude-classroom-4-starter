// jsdom, the config default.
import {
  A2UIProvider,
  A2UIRenderer,
  useA2UIActions,
} from "@copilotkit/a2ui-renderer";
import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { expect, test } from "vitest";
import { progressCatalog } from "@/components/a2ui-catalog";
import {
  PROGRESS_SURFACE_ID,
  progressFigures,
  progressOperations,
} from "@/lib/a2ui-progress";

/** Feeds the operations in the way the chat's surface host does. */
function Operations({ operations }: { operations: unknown[] }) {
  const { processMessages } = useA2UIActions();

  useEffect(() => {
    processMessages(operations as never);
  }, [operations, processMessages]);

  return null;
}

const rows = (total: number, done: number) =>
  Array.from({ length: total }, (_, index) => ({
    id: `id-${index}`,
    title: `Item ${index}`,
    done: index < done,
  }));

/**
 * The one place both halves of the feature meet: the tool's operations against
 * the catalog the provider registers. It is worth a test of its own because the
 * two most likely ways to break it are silent — a catalog id that stops
 * matching paints nothing, and a binding the binder declines to resolve reaches
 * the renderer as the raw `{ path }` object.
 */
test("the tool's operations paint the card through the catalog", () => {
  render(
    <A2UIProvider catalog={progressCatalog}>
      <Operations
        operations={progressOperations(progressFigures(rows(7, 3)))}
      />
      <A2UIRenderer surfaceId={PROGRESS_SURFACE_ID} />
    </A2UIProvider>,
  );

  // Composed from the basic catalog's Card, Column and Text…
  expect(screen.getByText("Progress on your list")).toBeInTheDocument();
  expect(screen.getByText("4 still open (57%)")).toBeInTheDocument();
  // …and the one component this catalog adds, with its bindings resolved.
  expect(screen.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "43",
  );
  expect(screen.getByText("3 of 7 done (43%)")).toBeInTheDocument();
});
