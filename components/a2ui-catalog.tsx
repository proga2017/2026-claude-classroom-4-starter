"use client";

import {
  type CatalogDefinitions,
  createCatalog,
} from "@copilotkit/a2ui-renderer";
// The A2UI binder reads a prop's Zod internals (`_def.typeName`) to decide
// whether to resolve it against the data model, and those internals only exist
// on zod 3. The app is on zod 4, which ships the older API under this subpath —
// so this import is load-bearing, not a leftover.
import { z } from "zod/v3";
import { ProgressBar } from "@/components/ui/progress-bar";
import { PROGRESS_CATALOG_ID } from "@/lib/a2ui-progress";

/**
 * A prop the surface may send either as a literal or as `{ path: "/field" }`.
 * The union is the only signal the binder has that a prop is bindable: declare
 * a bound prop as a plain `z.number()` and the raw `{ path }` object reaches
 * the renderer instead of the value.
 */
const dynamicNumber = z.union([z.number(), z.object({ path: z.string() })]);
const dynamicString = z.union([z.string(), z.object({ path: z.string() })]);

/**
 * What this catalog adds to A2UI's basic components. One entry, because the
 * basic catalog already covers the card, the column and the text around it —
 * it just has no bar.
 */
const definitions = {
  ProgressBar: {
    description:
      "A horizontal bar showing a share of a whole, with the same figure written out beneath it.",
    props: z.object({
      value: dynamicNumber.describe("The share to fill, 0 to 1"),
      label: dynamicString.describe("The figure in words, e.g. '3 of 7 done'"),
    }),
  },
};

/**
 * The binder resolves a bound prop before the renderer runs, so what arrives
 * here is the plain value rather than the `{ path }` object the schema declares
 * — the union describes what the surface may send, not what this has to handle.
 * Nothing in the types says so, hence `unknown` values and the narrowing below.
 */
type ResolvedProps = Record<string, unknown>;

const renderers = {
  // The margin matches the 8px the basic catalog's own leaves carry, so the bar
  // lines up with the text above and below it rather than sitting flush against
  // the card's padding.
  ProgressBar: ({ props }: { props: ResolvedProps }) => (
    <div className="m-2">
      <ProgressBar
        label={typeof props.label === "string" ? props.label : ""}
        value={typeof props.value === "number" ? props.value : 0}
      />
    </div>
  ),
};

/**
 * The catalog the chat registers and the tutor's `showProgress` tool names.
 * `includeBasicCatalog` merges A2UI's own Card, Column, Row and Text in, so a
 * card can be composed from them and the bar together.
 */
export const progressCatalog = createCatalog(
  // zod 3 arrives twice: through `zod/v3` here, and through the copy
  // `@copilotkit/a2ui-renderer` nests for itself. A private field on
  // `ZodObject` makes the two nominally incompatible although they are the same
  // shape at run time, and the binder matches on `_def` rather than
  // `instanceof` for exactly that reason. This cast is where that is admitted;
  // it also flattens the renderer's props, which is why `ResolvedProps` above
  // narrows them by hand.
  definitions as unknown as CatalogDefinitions,
  renderers,
  { catalogId: PROGRESS_CATALOG_ID, includeBasicCatalog: true },
);
