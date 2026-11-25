import type { Command, EditorView, KeyBinding } from "@codemirror/view";
import { formatMarkdownTables } from "@/lib/markdown/table";

function wrapSelection(
  view: EditorView,
  before: string,
  after = before,
  placeholder = ""
): boolean {
  const { state } = view;
  const range = state.selection.main;
  const selected = state.sliceDoc(range.from, range.to);

  // Unwrap if already wrapped (avoid stripping bold ** when toggling single-star italic *)
  const prevStart = Math.max(0, range.from - before.length);
  const nextEnd = Math.min(state.doc.length, range.to + after.length);
  const hasExactMarkers =
    state.sliceDoc(prevStart, range.from) === before &&
    state.sliceDoc(range.to, nextEnd) === after;
  const isBoldOnlyForItalic =
    before === "*" &&
    after === "*" &&
    prevStart >= 1 &&
    nextEnd < state.doc.length &&
    state.sliceDoc(prevStart - 1, range.from) === "**" &&
    state.sliceDoc(range.to, nextEnd + 1) === "**" &&
    !(
      prevStart >= 2 &&
      nextEnd + 1 < state.doc.length &&
      state.sliceDoc(prevStart - 2, range.from) === "***" &&
      state.sliceDoc(range.to, nextEnd + 2) === "***"
    );

  if (hasExactMarkers && !isBoldOnlyForItalic) {
    view.dispatch({
      changes: [
        { from: prevStart, to: range.from, insert: "" },
        { from: range.to, to: nextEnd, insert: "" },
      ],
      selection: {
        anchor: prevStart,
        head: prevStart + selected.length,
      },
    });
    return true;
  }

  const inner = selected || placeholder;
  const insert = `${before}${inner}${after}`;
  const anchor = range.from + before.length;
  const head = anchor + inner.length;

  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: { anchor, head },
  });
  return true;
}

function toggleLinePrefix(
  view: EditorView,
  prefix: string,
  ordered = false
): boolean {
  const { state } = view;
  const { from, to } = state.selection.main;
  const startLine = state.doc.lineAt(from).number;
  const endLine = state.doc.lineAt(to).number;

  const lines: { from: number; to: number; text: string }[] = [];
  for (let n = startLine; n <= endLine; n++) {
    const line = state.doc.line(n);
    lines.push({ from: line.from, to: line.to, text: line.text });
  }

  const allHavePrefix = ordered
    ? lines.every((l) => /^\d+\.\s/.test(l.text))
    : lines.every((l) => l.text.startsWith(prefix));

  const changes = lines.map((l, idx) => {
    if (allHavePrefix) {
      const removeLen = ordered
        ? (l.text.match(/^\d+\.\s/)?.[0].length ?? 0)
        : prefix.length;
      return { from: l.from, to: l.from + removeLen, insert: "" };
    }
    const ins = ordered ? `${idx + 1}. ` : prefix;
    return { from: l.from, to: l.from, insert: ins };
  });

  view.dispatch({ changes });
  return true;
}

export function setHeadingLevel(view: EditorView, level: number): boolean {
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.from);
  const match = line.text.match(/^(#{1,6})\s+/);
  const clamped = Math.max(0, Math.min(6, level));

  if (match) {
    const existingLevel = match[1].length;
    if (existingLevel === clamped || clamped === 0) {
      view.dispatch({
        changes: { from: line.from, to: line.from + match[0].length, insert: "" },
      });
      return true;
    }
    view.dispatch({
      changes: {
        from: line.from,
        to: line.from + match[0].length,
        insert: `${"#".repeat(clamped)} `,
      },
    });
    return true;
  }

  if (clamped === 0) return true;
  view.dispatch({
    changes: { from: line.from, to: line.from, insert: `${"#".repeat(clamped)} ` },
  });
  return true;
}

export function adjustHeadingLevel(view: EditorView, delta: 1 | -1): boolean {
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.from);
  const match = line.text.match(/^(#{1,6})\s+/);
  const current = match ? match[1].length : 0;

  if (delta === 1) {
    // Increase prominence: 0 -> H2, H3 -> H2, H2 -> H1, H1 stays H1
    const next = current === 0 ? 2 : Math.max(1, current - 1);
    return setHeadingLevel(view, next);
  }
  // Decrease prominence: H1 -> H2, ..., H6 -> plain text (0)
  if (current === 0) return setHeadingLevel(view, 3);
  const next = current >= 6 ? 0 : current + 1;
  return setHeadingLevel(view, next);
}

export const toggleBold: Command = (view) => wrapSelection(view, "**", "**", "加粗文本");
export const toggleItalic: Command = (view) => wrapSelection(view, "*", "*", "斜体文本");
export const toggleStrikethrough: Command = (view) =>
  wrapSelection(view, "~~", "~~", "删除线");
export const toggleInlineCode: Command = (view) => wrapSelection(view, "`", "`", "code");

export const insertCodeBlock: Command = (view) => {
  const { state } = view;
  const range = state.selection.main;
  const selected = state.sliceDoc(range.from, range.to);
  const insert = `\n\`\`\`\n${selected}\n\`\`\`\n`;
  const cursor = range.from + 4;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: { anchor: cursor },
  });
  return true;
};

export const toggleUnorderedList: Command = (view) => toggleLinePrefix(view, "- ");
export const toggleOrderedList: Command = (view) => toggleLinePrefix(view, "1. ", true);
export const toggleTaskList: Command = (view) => toggleLinePrefix(view, "- [ ] ");
export const toggleBlockquote: Command = (view) => toggleLinePrefix(view, "> ");

export const insertLink: Command = (view) => {
  const { state } = view;
  const range = state.selection.main;
  const selected = state.sliceDoc(range.from, range.to);
  const isUrl = /^https?:\/\//i.test(selected.trim());
  const text = isUrl ? "链接文本" : selected || "链接文本";
  const url = isUrl ? selected.trim() : "https://";
  const insert = `[${text}](${url})`;
  const urlStart = range.from + text.length + 3;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: { anchor: urlStart, head: urlStart + url.length },
  });
  return true;
};

export const insertHorizontalRule: Command = (view) => {
  const { state } = view;
  const pos = state.selection.main.to;
  const insert = "\n\n---\n\n";
  view.dispatch({
    changes: { from: pos, to: pos, insert },
    selection: { anchor: pos + insert.length },
  });
  return true;
};

export function insertTextAtCursor(view: EditorView, text: string): void {
  const range = view.state.selection.main;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: text },
    selection: { anchor: range.from + text.length },
  });
}

export function formatTablesInEditor(view: EditorView): number {
  const doc = view.state.doc.toString();
  const cursorLineZero = view.state.doc.lineAt(view.state.selection.main.from).number - 1;
  let result = formatMarkdownTables(doc, cursorLineZero);
  if (result.tablesFormatted === 0) {
    result = formatMarkdownTables(doc);
  }
  if (result.tablesFormatted > 0 && result.formatted !== doc) {
    const pos = Math.min(view.state.selection.main.from, result.formatted.length);
    view.dispatch({
      changes: { from: 0, to: doc.length, insert: result.formatted },
      selection: { anchor: pos },
    });
  }
  return result.tablesFormatted;
}

/**
 * Smart Enter continuation for unordered lists, ordered lists, task lists, and blockquotes.
 * Pressing Enter on an empty list item exits the list cleanly.
 */
export const smartMarkdownEnter: Command = (view) => {
  const { state } = view;
  const range = state.selection.main;
  if (!range.empty) return false;

  const line = state.doc.lineAt(range.from);
  // Only trigger when cursor is at or after the marker
  const beforeCursor = line.text.slice(0, range.from - line.from);

  // Task list
  const taskMatch = beforeCursor.match(/^(\s*)([-*+])\s+\[([ xX])\]\s+(.*)$/);
  if (taskMatch) {
    if (taskMatch[4].trim() === "" && range.from === line.to) {
      view.dispatch({ changes: { from: line.from, to: line.to, insert: "" } });
      return true;
    }
    const insert = `\n${taskMatch[1]}${taskMatch[2]} [ ] `;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert },
      selection: { anchor: range.from + insert.length },
    });
    return true;
  }

  // Unordered list
  const ulMatch = beforeCursor.match(/^(\s*)([-*+])\s+(.*)$/);
  if (ulMatch) {
    if (ulMatch[3].trim() === "" && range.from === line.to) {
      view.dispatch({ changes: { from: line.from, to: line.to, insert: "" } });
      return true;
    }
    const insert = `\n${ulMatch[1]}${ulMatch[2]} `;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert },
      selection: { anchor: range.from + insert.length },
    });
    return true;
  }

  // Ordered list
  const olMatch = beforeCursor.match(/^(\s*)(\d+)\.\s+(.*)$/);
  if (olMatch) {
    if (olMatch[3].trim() === "" && range.from === line.to) {
      view.dispatch({ changes: { from: line.from, to: line.to, insert: "" } });
      return true;
    }
    const nextNum = parseInt(olMatch[2], 10) + 1;
    const insert = `\n${olMatch[1]}${nextNum}. `;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert },
      selection: { anchor: range.from + insert.length },
    });
    return true;
  }

  // Blockquote
  const quoteMatch = beforeCursor.match(/^(\s*>\s+)(.*)$/);
  if (quoteMatch) {
    if (quoteMatch[2].trim() === "" && range.from === line.to) {
      view.dispatch({ changes: { from: line.from, to: line.to, insert: "" } });
      return true;
    }
    const insert = `\n${quoteMatch[1]}`;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert },
      selection: { anchor: range.from + insert.length },
    });
    return true;
  }

  return false;
};

export function createMarkdownKeymap(callbacks: {
  onInsertImage?: () => void;
  onFormatTable?: () => void;
}): KeyBinding[] {
  return [
    { key: "Mod-b", run: toggleBold },
    { key: "Mod-i", run: toggleItalic },
    { key: "Mod-Shift-x", run: toggleStrikethrough },
    { key: "Mod-e", run: toggleInlineCode },
    { key: "Mod-Shift-k", run: insertCodeBlock },
    { key: "Mod-Shift-l", run: insertLink },
    { key: "Mod-Shift-8", run: toggleUnorderedList },
    { key: "Mod-Shift-7", run: toggleOrderedList },
    { key: "Mod-Shift-9", run: toggleTaskList },
    { key: "Mod-Shift-.", run: toggleBlockquote },
    { key: "Mod-1", run: (v) => setHeadingLevel(v, 1) },
    { key: "Mod-2", run: (v) => setHeadingLevel(v, 2) },
    { key: "Mod-3", run: (v) => setHeadingLevel(v, 3) },
    { key: "Mod-4", run: (v) => setHeadingLevel(v, 4) },
    { key: "Mod-5", run: (v) => setHeadingLevel(v, 5) },
    { key: "Mod-6", run: (v) => setHeadingLevel(v, 6) },
    { key: "Mod-]", run: (v) => adjustHeadingLevel(v, 1) },
    { key: "Mod-[", run: (v) => adjustHeadingLevel(v, -1) },
    {
      key: "Mod-Shift-i",
      run: () => {
        callbacks.onInsertImage?.();
        return true;
      },
    },
    {
      key: "Mod-Shift-f",
      run: () => {
        callbacks.onFormatTable?.();
        return true;
      },
    },
    { key: "Enter", run: smartMarkdownEnter },
  ];
}
