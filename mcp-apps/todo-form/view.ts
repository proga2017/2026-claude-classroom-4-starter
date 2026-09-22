// No framework, and the only import is the MCP Apps SDK: the built file is the
// whole view, and every byte of it — SDK included — ships inside the one HTML
// document the host loads.
import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
  PostMessageTransport,
} from "@modelcontextprotocol/ext-apps";

type Todo = { id: string; title: string; done: boolean };

/**
 * The `structuredContent` both form tools answer with. Its shape is the
 * `outputSchema` they are registered with in lib/mcp-server.ts, which this
 * view cannot import because that module reaches the database; `todo` is the
 * item just saved, so only `submit_todo_form` carries one.
 */
type TodoFormResult = { todo?: Todo; openTodos: Todo[] };

/** The view's end of the host connection; everything below it is wiring. */
const app = new App({ name: "ai-tutor-todo-form", version: "0.1.0" });

const titleInput = document.getElementById("todo-title") as HTMLInputElement;
const addButton = document.getElementById("add-todo") as HTMLButtonElement;
const statusLine = document.getElementById("status") as HTMLParagraphElement;
const openList = document.getElementById("open-todos") as HTMLUListElement;
const openEmpty = document.getElementById(
  "open-todos-empty",
) as HTMLParagraphElement;

/** Prefills the input with the title `open_todo_form` was called with. */
export function setTitle(text: string) {
  titleInput.value = text;
  syncAddButton();
}

export function setStatus(text: string, kind: "info" | "error" = "info") {
  statusLine.textContent = text;
  statusLine.dataset.kind = kind;
}

export function renderOpenTodos(
  items: { id: number | string; title: string }[],
) {
  openList.replaceChildren(
    ...items.map((item) => {
      const row = document.createElement("li");
      row.dataset.id = String(item.id);
      // textContent, never innerHTML: a to-do title is someone's own text.
      row.textContent = item.title;
      return row;
    }),
  );
  openEmpty.hidden = items.length > 0;
}

/** An empty title is not a to-do, so the button says so before the click does. */
function syncAddButton() {
  addButton.disabled = titleInput.value.trim() === "";
}

/** The text blocks of a tool result, which is where an error result says why. */
function resultText(content: { type: string }[]) {
  return content
    .map((block) => ("text" in block ? String(block.text) : ""))
    .join(" ")
    .trim();
}

/**
 * Hands the model what it would otherwise have to ask a tool for. Only the
 * last update reaches it, so this carries the whole open list and not just the
 * addition.
 */
function tellModel({ todo, openTodos }: TodoFormResult) {
  const open = openTodos.map((item) => item.title).join("; ") || "none";
  return app.updateModelContext({
    content: [
      {
        type: "text",
        text: `The user added "${todo?.title}" to their to-do list through the form. Their open to-dos are now: ${open}.`,
      },
    ],
    structuredContent: { todo, openTodos },
  });
}

/**
 * The save. `submit_todo_form` is app-only, so this call is the only way an
 * item reaches the list from here, and the user's click is the only way here.
 */
async function onSubmit(title: string) {
  addButton.disabled = true;
  setStatus("Adding…");
  try {
    const result = await app.callServerTool({
      name: "submit_todo_form",
      arguments: { title },
    });
    if (result.isError) throw new Error(resultText(result.content));

    const saved = result.structuredContent as TodoFormResult;
    titleInput.value = "";
    renderOpenTodos(saved.openTodos);
    setStatus(`Added "${saved.todo?.title ?? title}".`);
    await tellModel(saved);
  } catch (error) {
    // A title the contract refuses comes back as a tool error, a host that
    // will not pass the call on as a throw; the user reads the same line.
    setStatus(
      `Not added: ${error instanceof Error ? error.message : String(error)}`,
      "error",
    );
  } finally {
    syncAddButton();
  }
}

function submit() {
  const title = titleInput.value.trim();
  if (title === "") return;
  onSubmit(title);
}

titleInput.addEventListener("input", syncAddButton);
titleInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  // The view is one field, so Enter is the submit an outer <form> would give.
  event.preventDefault();
  submit();
});
addButton.addEventListener("click", submit);

syncAddButton();
renderOpenTodos([]);

/**
 * Takes the host's look: its theme drives `[data-theme]` in style.css, its
 * variables and fonts land on the document for the rules that name them. The
 * host sends a context at connect and a fresh one whenever it changes, and
 * each arrives as a partial, so every field is checked before it is applied.
 */
function applyHostLook(context: McpUiHostContext | undefined) {
  if (context?.theme) applyDocumentTheme(context.theme);
  if (context?.styles?.variables) {
    applyHostStyleVariables(context.styles.variables);
  }
  if (context?.styles?.css?.fonts) applyHostFonts(context.styles.css.fonts);
}

// Every handler before `connect`: the host sends the tool input right after
// the handshake, and a notification with no handler is simply dropped.
app.ontoolinput = ({ arguments: args }) => {
  const title = args?.title;
  if (typeof title === "string") setTitle(title);
};
// The result of the `open_todo_form` call that put this view on screen — no
// other tool result reaches it — and it brings the list the form shows.
app.ontoolresult = (result) => {
  const opened = result.structuredContent as TodoFormResult | undefined;
  if (opened) renderOpenTodos(opened.openTodos);
};
app.onhostcontextchanged = applyHostLook;

// Twice the same window: the host is where messages go, and the only sender
// this view accepts them from.
app.connect(new PostMessageTransport(window.parent, window.parent)).then(
  // The context from the handshake is not notified, so it is read once here.
  () => applyHostLook(app.getHostContext()),
  (error: Error) =>
    setStatus(`No MCP host answered: ${error.message}`, "error"),
);
