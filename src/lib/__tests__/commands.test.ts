import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";

import {
  adjustHeadingLevel,
  createMarkdownKeymap,
  formatTablesInEditor,
  insertLink,
  setHeadingLevel,
  smartMarkdownEnter,
  toggleBold,
  toggleItalic,
  toggleUnorderedList,
} from "@/lib/markdown/commands";

function createTestView(doc: string, anchor: number, head = anchor): EditorView {
  const parent = document.createElement("div");
  const state = EditorState.create({
    doc,
    selection: { anchor, head },
  });
  return new EditorView({ state, parent });
}

describe("CodeMirror 6 Markdown editing commands", () => {
  it("toggles bold and unwraps when already bolded, and supports bold+italic nesting", () => {
    const view = createTestView("hello world", 0, 5);
    toggleBold(view);
    expect(view.state.doc.toString()).toBe("**hello** world");
    // Toggling italic inside bold wraps to ***hello*** instead of stripping bold
    toggleItalic(view);
    expect(view.state.doc.toString()).toBe("***hello*** world");
    // Toggling italic again unwraps back to **hello**
    toggleItalic(view);
    expect(view.state.doc.toString()).toBe("**hello** world");
    // Unwrap bold
    toggleBold(view);
    expect(view.state.doc.toString()).toBe("hello world");
    view.destroy();
  });

  it("toggles italic and unordered lists", () => {
    const view = createTestView("alpha\nbeta", 0, 10);
    toggleUnorderedList(view);
    expect(view.state.doc.toString()).toBe("- alpha\n- beta");
    toggleUnorderedList(view);
    expect(view.state.doc.toString()).toBe("alpha\nbeta");

    view.dispatch({ selection: { anchor: 0, head: 5 } });
    toggleItalic(view);
    expect(view.state.doc.toString()).toBe("*alpha*\nbeta");
    view.destroy();
  });

  it("adjusts heading levels up and down cleanly", () => {
    const view = createTestView("Section", 2);
    setHeadingLevel(view, 3);
    expect(view.state.doc.toString()).toBe("### Section");
    adjustHeadingLevel(view, 1);
    expect(view.state.doc.toString()).toBe("## Section");
    adjustHeadingLevel(view, -1);
    expect(view.state.doc.toString()).toBe("### Section");
    setHeadingLevel(view, 3);
    expect(view.state.doc.toString()).toBe("Section");
    view.destroy();
  });

  it("continues ordered/unordered lists on Enter and exits on empty item", () => {
    const view1 = createTestView("1. First item", 13);
    expect(smartMarkdownEnter(view1)).toBe(true);
    expect(view1.state.doc.toString()).toBe("1. First item\n2. ");
    // Pressing Enter again on empty `2. ` exits the list
    expect(smartMarkdownEnter(view1)).toBe(true);
    expect(view1.state.doc.toString()).toBe("1. First item\n");
    view1.destroy();

    const view2 = createTestView("- [x] Done", 10);
    expect(smartMarkdownEnter(view2)).toBe(true);
    expect(view2.state.doc.toString()).toBe("- [x] Done\n- [ ] ");
    view2.destroy();
  });

  it("formats tables directly in EditorView", () => {
    const view = createTestView("| a | b |\n|---|---|\n| 1 | longcell |", 3);
    const count = formatTablesInEditor(view);
    expect(count).toBe(1);
    expect(view.state.doc.toString()).toContain("| 1   | longcell |");
    view.destroy();
  });

  it("binds insertLink to Mod-Shift-l and leaves Mod-k free for CommandPalette", () => {
    const bindings = createMarkdownKeymap({});
    expect(bindings.find((b) => b.key === "Mod-k")).toBeUndefined();
    const linkBinding = bindings.find((b) => b.key === "Mod-Shift-l");
    expect(linkBinding).toBeDefined();
    expect(linkBinding?.run).toBe(insertLink);
  });
});
