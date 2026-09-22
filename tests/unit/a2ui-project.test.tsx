// jsdom, the config default.
import {
  A2UIProvider,
  A2UIRenderer,
  useA2UIActions,
} from "@copilotkit/a2ui-renderer";
import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { expect, test } from "vitest";
import { PROJECT_SURFACE_ID, projectOperations } from "@/lib/a2ui-project";

/** Feeds the operations in the way components/project-wizard.tsx does. */
function Operations({ operations }: { operations: unknown[] }) {
  const { processMessages } = useA2UIActions();

  useEffect(() => {
    processMessages(operations as never);
  }, [operations, processMessages]);

  return null;
}

/**
 * The card is composed entirely from A2UI's basic catalog, whose prop schemas
 * are `.strict()` — a prop the tree invents, or a value bound in the wrong
 * shape, is refused there rather than here. Both failures are silent in the
 * browser, so the tree is worth painting once against the real catalog.
 */
test("the tool's operations paint the card through the basic catalog", () => {
  render(
    // No catalog: the provider falls back to the basic one, whose id the
    // surface names.
    <A2UIProvider>
      <Operations
        operations={projectOperations({
          title: "Shop relaunch",
          description: "Rebuild the storefront on the new platform.",
          startDate: "2026-04-13",
          endDate: "2026-05-01",
          effortPersonDays: 30,
          criticality: "high",
        })}
      />
      <A2UIRenderer surfaceId={PROJECT_SURFACE_ID} />
    </A2UIProvider>,
  );

  // Every field is an input carrying its value, not a line of text.
  expect(screen.getByLabelText("Title")).toHaveValue("Shop relaunch");
  expect(screen.getByLabelText("Description")).toHaveValue(
    "Rebuild the storefront on the new platform.",
  );
  expect(screen.getByLabelText("Start date")).toHaveValue("2026-04-13");
  expect(screen.getByLabelText("End date")).toHaveValue("2026-05-01");
  expect(screen.getByLabelText("Effort in person-days")).toHaveValue(30);
  expect(screen.getByLabelText("High")).toBeChecked();
});
