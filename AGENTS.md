# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

# ai-tutor

AI tutoring web app on Next.js 16 App Router + React 19 + Tailwind v4: a Mastra agent (Bartholomew, a butler who keeps the user's to-do list) served to a CopilotKit chat over AG-UI, behind Better Auth email/password sign-in, over a Drizzle/SQLite persistence layer, with a Vitest + Playwright test harness. The same list is reachable through a REST API, a CLI, and two MCP servers.

The source is commented where a decision is not obvious; this file is the map, plus the traps that no single file shows. Open the file before asking here.

## Map

```
app/
  layout.tsx, globals.css         root layout; design tokens and the CopilotKit theme bridge
  page.tsx                        `/`, the chat page (session-gated Server Component)
  login/, signup/                 email/password forms (client components)
  projects/new/                   the project wizard: one A2UI card, drawn by the wizard agent, no chat
  device/, consent/               approval pages for the CLI device flow and for MCP OAuth
  api/auth/[...all]/              Better Auth handler
  api/copilotkit/[...all]/        AG-UI bridge: session → Mastra agent → CopilotKit runtime
  api/wizard/[...all]/            the same bridge for the wizard agent, with A2UI off on the runtime
  api/todos/, api/todos/[id]/     REST API over lib/todo-tools.ts
  api/mcp/                        MCP server over HTTP, OAuth-protected
  .well-known/                    OAuth discovery documents, handed to Better Auth
components/
  chat.tsx                        CopilotKit provider, CopilotChat, and the sidebar in one tree
  todos-sidebar.tsx               read-only mirror of the list; the agent is the browser's only write path
  todo-tool-calls.tsx             useRenderTool renderers for the three list-editing agent tools
  a2ui-catalog.tsx                the A2UI catalog the provider registers: basic components plus ProgressBar
  project-wizard.tsx, device-approval.tsx, oauth-consent.tsx, sign-out-button.tsx
  ui/                             presentational primitives — extend one instead of repeating its class string
lib/
  tutor.ts                        the whole agent: instructions, model, memory, tools
  todo-tools.ts                   every todo query; the agent tools, the REST routes and both MCP servers call it
  a2ui-progress.ts                the progress card: ids, the figures, and the component tree `showProgress` returns
  wizard.ts                       the wizard agent: its own model, no memory, and the one `setProject` tool
  a2ui-project.ts                 the project card: ids, the bound field shapes, and the tree `setProject` returns
  db.ts, schema.ts, auth-schema.ts   cached Drizzle connection; app tables; generated auth tables
  auth.ts, auth-config.ts, auth-cli.ts, auth-client.ts   server instance; shared options; auth:generate target; browser client
  api-route.ts                    bearer-only session and JSON helpers for /api/todos
  mcp-server.ts, mcp-app-views.ts MCP server factory; reader for built MCP App views
  project.ts, tool-result.ts      wizard rules (plain module); AG-UI tool-result decoding
packages/api-contract/            zod request/response schemas and MCP tool definitions shared by app and CLI
cli/                              `ai-tutor` CLI (commander, esbuild-bundled) including `mcp --stdio`
mcp-apps/<name>/ → mcp-apps/dist/ MCP App views, each bundled into one HTML file by scripts/build-views.mjs
drizzle/                          generated migrations
tests/unit, tests/integration     Vitest (node env by default; *.test.tsx is jsdom)
tests/e2e                         Playwright against its own `next dev`
docs/mcp.md                       registering both MCP servers with Claude Code
.agents/skills/ (+ .claude/skills/ copy)   ai-tutor-design, ai-tutor-cli, add-app-to-server, copilotkit, mastra
.tours/                           CodeTours the README points at
```

## Commands

- `npm run dev` / `build` / `start`; `npm run lint` (`biome check`) and `npm run format` — Biome only, never add ESLint or Prettier.
- `npm test` (Vitest), `npm run test:e2e` (Playwright), `npm run test:e2e:llm` (the one spec that spends OpenRouter credit).
- Schema change: edit `lib/schema.ts`, then `npm run db:generate` and `npm run db:migrate`.
- Auth change that touches tables: `npm run auth:generate` (rewrites `lib/auth-schema.ts` wholesale), then `db:generate` and `db:migrate`.
- `npm install` builds the CLI through its `prepare` script; rebuild after edits with `npm run build -w ai-tutor-cli`.
- `npm run build:views` bundles the MCP App views; `predev`/`prebuild` run it, but `next dev` does not watch `mcp-apps/`, so re-run it by hand after editing a view.

## Gotchas

### Build and tooling

- `PageProps<'/route'>` and `LayoutProps<'/route'>` are globals generated by `next dev`/`next build`/`next typegen`, so generate them before typechecking a clean checkout.
- If Turbopack fails to replace a symlink under `.next/dev/node_modules`, stop the server and delete that generated directory.
- If a build reports stale generated route types while `tsc --noEmit --incremental false` passes, delete `.next/cache/.tsbuildinfo`.
- TypeScript is v7, so `next build` type-checks by shelling out to the project-local `tsc` and prints plain diagnostics without code frames.
- `npm run format` skips assist actions such as import sorting; use `npx biome check --write <path>` for those.
- The e2e and CLI test servers set `NEXT_DIST_DIR` (`.next-e2e`, `.next-cli-test`) to coexist with a running `npm run dev`; `next dev` adds their type dirs to `tsconfig.json` itself and reformats the file, so run `npm run format` afterwards.
- `@copilotkit/runtime` drags in a zod-3 tree while Better Auth is on zod 4; npm nests the zod 3 copy under `@copilotkit/runtime/node_modules` on its own — no `.npmrc` or `--legacy-peer-deps`.
- `@modelcontextprotocol/ext-apps` 2.x is a root dependency while `@copilotkit/react-core` nests its own 1.7.5; both are expected in `npm ls`.

### Persistence and auth

- `drizzle/` is generated, except that SQLite cannot `ADD` a `NOT NULL` column without a default, so such a migration is hand-edited into a table rebuild that backfills it, as `0004` does.
- Mastra creates and owns its `mastra_*` tables in the same SQLite file; they are not in `lib/schema.ts` and `db:generate` must not try to manage them.
- The driver is `drizzle-orm/libsql/node`; do not install `better-sqlite3`.
- Every plugin that adds tables (`deviceAuthorization`, `jwt`, `mcp`, `cimd`) must be in `lib/auth-cli.ts`'s plugin array too, or its tables drop out of the next `auth:generate`.
- There is deliberately no `proxy.ts`: gate pages server-side with `auth.api.getSession` plus `redirect()`, as `app/page.tsx` does.
- `mcp()` from `@better-auth/mcp` is the OAuth provider; `@better-auth/oauth-provider` is a dependency only for its client plugin, so never add `oauthProvider()` beside `mcp()`.
- A new MCP scope has to be listed in `mcpOptions().scopes` and described in `components/oauth-consent.tsx`.
- `Authorization: Bearer` must carry the signed token from sign-in's `set-auth-token` header, not the raw session token; in tests that is `login().cookies[0].value`, not `login().token`.

### Agent and CopilotKit

- `@copilotkit/react-core/v2` and `@copilotkit/runtime/v2` (`createCopilotRuntimeHandler`) are the only surfaces that work here; `@copilotkit/react-ui`, the package roots, and the Express/Hono adapters are v1.
- CopilotKit questions go through the `copilotkit` skill, which sends you to the `copilotkit-docs` MCP server in `.mcp.json`; Mastra questions through the `mastra` skill.
- Mastra memory is durable in SQLite, but the default `InMemoryAgentRunner` also keeps a bounded replay cache that can restore the browser transcript until eviction or restart — do not mistake either for the other when debugging.
- The wizard runs on `gemini-3.1-flash-lite` rather than the tutor's model on purpose: a reasoning model works the dates and person-days out while reasoning and then omits them from the tool call, and the card only ever shows what the call carried.
- `lib/wizard.ts` passes `instructions` as a function so Mastra resolves it per run, which is the only reason today's date is today's in a process that outlives midnight.

### A2UI

- Two paths share the catalog: `showProgress` owns its fixed tree, while the runtime's `injectA2UITool: true` adds `render_a2ui` for surfaces the model composes itself.
- The flags alone do not make the dynamic path usable: Bartholomew declines everything off-list, so `lib/tutor.ts` carves an explicit drawing exception out of its refusal block — without it a "draw me…" prompt is refused and no tool is ever called.
- The provider's `includeSchema: true` is load-bearing twice over: it ships the component schemas the model composes against, and the middleware reads the `catalogId` back out of that same context to stamp model-composed surfaces, so switching it off breaks them with "Catalog not found" while the fixed card keeps working.
- `PROGRESS_CATALOG_ID` has to be the same string on both ends; a mismatch throws "Catalog not found" in the renderer rather than degrading to something unstyled.
- A catalog definition's bound props must be declared as a `z.union([literal, z.object({ path })])`, and in **zod 3** (`zod/v3`) — the binder decides what to resolve by reading `_def.typeName`, which zod 4 does not have, and an unresolved `{ path }` object reaching a renderer surfaces as React error #31.
- `createCatalog` types come from the renderer's own nested zod 3, so `components/a2ui-catalog.tsx` casts the definitions once; the two copies are structurally identical at run time, which is why the binder matches on `_def` rather than `instanceof`.
- The project card is a third path: it is rendered outside any chat, so `components/project-wizard.tsx` does the surface host's job itself — `A2UIProvider` plus `A2UIRenderer`, fed from the tool result in `runAgent`'s `newMessages` — and its runtime carries no `a2ui` config and its provider no `a2ui` prop, either of which would turn the middleware and `render_a2ui` back on.
- That card names A2UI's own `BASIC_CATALOG_ID`, which is what `A2UIProvider` registers when it is handed no catalog; the basic prop schemas are `.strict()`, so an invented prop is refused rather than ignored, and a `TextField` binds a string while a `ChoicePicker` binds a list — `projectFields` reshapes the project for both.
- A surface is created once per provider, so repainting means remounting `A2UIProvider` under a new `key`; feeding a second `createSurface` for an id it already holds throws instead.

### MCP Apps

- `open_todo_form`, `submit_todo_form` and their `ui://` resource are registered in `lib/mcp-server.ts` only and stay out of the contract's `mcpTools`, because `ai-tutor mcp --stdio` registers everything in there and a terminal has no iframe to draw a form in.
- `submit_todo_form` carries `visibility: ["app"]`, which keeps it off the model's tool list: the form's `callServerTool` is the only caller, so an item lands on the list only through the user's own click.
- Both form tools answer with the same `todoFormResult` shape, and `mcp-apps/todo-form/view.ts` re-declares it by hand because it cannot import a module that reaches the database — change the two together.
- A refused argument comes back as an `isError` result, not a thrown error, so the form reads its message out of `result.content` and only then falls back to a catch.
- The view reports a save with `updateModelContext` so the next turn needs no tool call; only the last update reaches the model, so each one carries the whole open list.
- The `ui://` resource reads `mcp-apps/dist/todo-form.html` through `readView`, so a host sees the form only after `npm run build:views`; an unbuilt view makes the read throw rather than serve an empty page.
- A view's handlers go on the `App` before `connect`, and the host context that arrives with the handshake is not notified, so `mcp-apps/todo-form/view.ts` reads it once from `getHostContext()` afterwards.
- `PostMessageTransport` defaults both constructor arguments at run time but its types require them, so a view passes `window.parent` twice.

### Styling

- Read `.agents/skills/ai-tutor-design/SKILL.md` before touching anything visual, and update it in the same change set when a rule changes.
- `Source_Sans_3` at 400/600 is the only face loaded, so there is no `font-mono` utility to reach for.
- The chat's composer, send button and radii are hardcoded CopilotKit utilities that `globals.css` overrides by hand; after a CopilotKit upgrade, a pill-shaped composer means the overrides no longer match.
- A2UI's basic components carry inline styles and read no theme, so `.a2ui-surface` — its card, its inputs and their labels — is squared and recoloured with the only `!important` block in `globals.css`, and that block is deliberately not scoped to `[data-copilotkit]` because the wizard's card renders outside the chat; a custom catalog component is plain React and takes the ramp's utilities directly.

### Tests

- Vitest only picks up `tests/{unit,integration}/**/*.test.{ts,tsx}` and cannot render async Server Components, so cover those with e2e.
- Vitest does not load `.env`: tests stub `DATABASE_URL`/`BETTER_AUTH_*` onto temp files, and `server-only` resolves to its throwing build outside Next.js, so modules that import it are loaded under `vi.mock("server-only", () => ({}))`.
- `tests/e2e/*.spec.ts` hit `data/app.db`, so they sign up `Date.now()`-stamped emails; `*.llm.spec.ts` is ignored unless `E2E_LLM` is set.
- The token-verified path of `/api/mcp` needs the app's own JWKS over HTTP, so it has no unit test; `tests/integration/cli.test.ts` is the one place a real `next dev` is exercised from Vitest.

### CLI

- The `--help` text is the CLI's only documentation and is written for agents too, so change it alongside any behavior.
- `.agents/skills/ai-tutor-cli/SKILL.md` (and its `.claude/skills/` copy) only says when to reach for the CLI; update it when a command is added, renamed, or removed.

### Secrets

- `.env` holds `DATABASE_URL`, `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL`, and `OPENROUTER_API_KEY` (see `.env.example`); never commit it or print its values.

## Maintenance — for you, the agent

- Update this file in the same change set whenever a change invalidates a line here or teaches a costly lesson.
- Keep it a map plus non-obvious traps: anything a reader learns by opening the file a line points to belongs in that file's comments, not here.
- One sentence per bullet, current state only, no history.
- The two `.tours/*.tour` files anchor by line number into the files they name (`app/page.tsx`, `lib/tutor.ts`, `lib/todo-tools.ts`, the CopilotKit route, `components/`, `scripts/build-views.mjs`, `lib/mcp-app-views.ts`, `mcp-apps/todo-form/`, `package.json`, `.gitignore`, and their tests), so re-check `line` values when those statements move.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
