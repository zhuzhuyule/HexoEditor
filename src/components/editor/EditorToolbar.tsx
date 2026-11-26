import type { EditorView } from "@codemirror/view";
import {
  Bold,
  Code,
  FileCode2,
  Heading1,
  Heading2,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Strikethrough,
  Table2,
  Wand2,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { getMessages } from "@/lib/i18n";
import {
  adjustHeadingLevel,
  insertCodeBlock,
  insertHorizontalRule,
  insertLink,
  insertTextAtCursor,
  toggleBlockquote,
  toggleBold,
  toggleInlineCode,
  toggleItalic,
  toggleOrderedList,
  toggleStrikethrough,
  toggleTaskList,
  toggleUnorderedList,
} from "@/lib/markdown/commands";
import { generateMarkdownTable } from "@/lib/markdown/table";
import { useAppStore } from "@/stores/useAppStore";

interface EditorToolbarProps {
  getView: () => EditorView | null;
  onInsertLocalImage: () => void;
  onFormatTables: () => void;
}

export function EditorToolbar({
  getView,
  onInsertLocalImage,
  onFormatTables,
}: EditorToolbarProps) {
  const locale = useAppStore((s) => s.locale);
  const msg = getMessages(locale);

  const [tableOpen, setTableOpen] = useState(false);
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);

  const runCmd = (fn: (view: EditorView) => boolean | void) => {
    const view = getView();
    if (!view) return;
    view.focus();
    fn(view);
  };

  const handleInsertTable = () => {
    const view = getView();
    if (!view) return;
    view.focus();
    const md = `\n${generateMarkdownTable(rows, cols)}\n`;
    insertTextAtCursor(view, md);
    setTableOpen(false);
  };

  return (
    <div className="flex h-8 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-zinc-200/70 bg-white px-2 select-none no-scrollbar">
      <Button
        variant="ghost"
        size="iconSm"
        title={msg.toolbar.bold}
        onClick={() => runCmd(toggleBold)}
      >
        <Bold className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="iconSm"
        title={msg.toolbar.italic}
        onClick={() => runCmd(toggleItalic)}
      >
        <Italic className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="iconSm"
        title={msg.toolbar.strike}
        onClick={() => runCmd(toggleStrikethrough)}
      >
        <Strikethrough className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="iconSm"
        title={msg.toolbar.inlineCode}
        onClick={() => runCmd(toggleInlineCode)}
      >
        <Code className="h-3.5 w-3.5" />
      </Button>

      <Separator orientation="vertical" className="mx-1 h-4" />

      <Button
        variant="ghost"
        size="iconSm"
        title={msg.toolbar.headingUp}
        onClick={() => runCmd((v) => adjustHeadingLevel(v, 1))}
      >
        <Heading1 className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="iconSm"
        title={msg.toolbar.headingDown}
        onClick={() => runCmd((v) => adjustHeadingLevel(v, -1))}
      >
        <Heading2 className="h-3.5 w-3.5" />
      </Button>

      <Separator orientation="vertical" className="mx-1 h-4" />

      <Button
        variant="ghost"
        size="iconSm"
        title={msg.toolbar.ul}
        onClick={() => runCmd(toggleUnorderedList)}
      >
        <List className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="iconSm"
        title={msg.toolbar.ol}
        onClick={() => runCmd(toggleOrderedList)}
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="iconSm"
        title={msg.toolbar.task}
        onClick={() => runCmd(toggleTaskList)}
      >
        <ListChecks className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="iconSm"
        title={msg.toolbar.quote}
        onClick={() => runCmd(toggleBlockquote)}
      >
        <Quote className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="iconSm"
        title={msg.toolbar.codeBlock}
        onClick={() => runCmd(insertCodeBlock)}
      >
        <FileCode2 className="h-3.5 w-3.5" />
      </Button>

      <Separator orientation="vertical" className="mx-1 h-4" />

      <Button
        variant="ghost"
        size="iconSm"
        title={msg.toolbar.link}
        onClick={() => runCmd(insertLink)}
      >
        <Link2 className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="iconSm"
        title={msg.toolbar.image}
        onClick={onInsertLocalImage}
      >
        <ImagePlus className="h-3.5 w-3.5" />
      </Button>

      <Popover open={tableOpen} onOpenChange={setTableOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="iconSm" title={msg.toolbar.table}>
            <Table2 className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-52 p-3">
          <div className="space-y-2.5">
            <div className="text-xs font-medium text-zinc-700">{msg.toolbar.table}</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-[11px] text-zinc-500">
                <span>{msg.toolbar.tableRows}</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={rows}
                  onChange={(e) => setRows(Number(e.target.value) || 1)}
                  className="h-7 w-full rounded border border-zinc-200 px-2 text-xs text-zinc-800"
                />
              </label>
              <label className="space-y-1 text-[11px] text-zinc-500">
                <span>{msg.toolbar.tableCols}</span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={cols}
                  onChange={(e) => setCols(Number(e.target.value) || 1)}
                  className="h-7 w-full rounded border border-zinc-200 px-2 text-xs text-zinc-800"
                />
              </label>
            </div>
            <Button size="xs" className="w-full" onClick={handleInsertTable}>
              {msg.toolbar.insertTableAction}
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Button
        variant="ghost"
        size="iconSm"
        title={msg.toolbar.formatTable}
        onClick={onFormatTables}
      >
        <Wand2 className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="iconSm"
        title={msg.toolbar.hr}
        onClick={() => runCmd(insertHorizontalRule)}
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
