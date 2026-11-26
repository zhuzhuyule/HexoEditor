/**
 * GFM Markdown Table generator & CJK-aware formatter.
 */

function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    // Wide East Asian / CJK / fullwidth chars count as 2 columns
    if (
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe19) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x20000 && code <= 0x2fffd)
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

type Align = "left" | "center" | "right" | "none";

function splitRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|") && !trimmed.endsWith("\\|")) {
    trimmed = trimmed.slice(0, -1);
  }
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === "\\" && trimmed[i + 1] === "|") {
      current += "\\|";
      i++;
    } else if (trimmed[i] === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += trimmed[i];
    }
  }
  cells.push(current.trim());
  return cells;
}

function isSeparatorLine(line: string): boolean {
  if (!line.includes("|")) return false;
  const cells = splitRow(line);
  if (cells.length === 0) return false;
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
}

function parseAlignments(sepCells: string[]): Align[] {
  return sepCells.map((cell) => {
    const clean = cell.replace(/\s+/g, "");
    const left = clean.startsWith(":");
    const right = clean.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return "none";
  });
}

function padCell(content: string, targetWidth: number, align: Align): string {
  const pad = Math.max(0, targetWidth - displayWidth(content));
  if (align === "right") {
    return `${" ".repeat(pad)}${content}`;
  }
  if (align === "center") {
    const left = Math.floor(pad / 2);
    const right = pad - left;
    return `${" ".repeat(left)}${content}${" ".repeat(right)}`;
  }
  return `${content}${" ".repeat(pad)}`;
}

function formatSeparatorCell(width: number, align: Align): string {
  const w = Math.max(3, width);
  if (align === "center") {
    return `:${"-".repeat(Math.max(1, w - 2))}:`;
  }
  if (align === "right") {
    return `${"-".repeat(Math.max(2, w - 1))}:`;
  }
  if (align === "left") {
    return `:${"-".repeat(Math.max(2, w - 1))}`;
  }
  return "-".repeat(w);
}

export function formatSingleTable(lines: string[]): string[] {
  if (lines.length < 2) return lines;
  const header = splitRow(lines[0]);
  const sep = splitRow(lines[1]);
  const bodyRows = lines.slice(2).map(splitRow);
  const colCount = Math.max(
    header.length,
    sep.length,
    ...bodyRows.map((r) => r.length)
  );
  const alignments = parseAlignments(sep);
  while (alignments.length < colCount) alignments.push("none");

  const normalizedRows = [header, ...bodyRows].map((row) => {
    const padded = [...row];
    while (padded.length < colCount) padded.push("");
    return padded;
  });

  const colWidths = Array.from({ length: colCount }, (_, col) =>
    Math.max(3, ...normalizedRows.map((row) => displayWidth(row[col])))
  );

  const out: string[] = [];
  const headerLine =
    "| " +
    normalizedRows[0]
      .map((cell, i) => padCell(cell, colWidths[i], alignments[i]))
      .join(" | ") +
    " |";
  const sepLine =
    "| " +
    colWidths.map((w, i) => formatSeparatorCell(w, alignments[i])).join(" | ") +
    " |";
  out.push(headerLine, sepLine);

  for (let r = 1; r < normalizedRows.length; r++) {
    out.push(
      "| " +
        normalizedRows[r]
          .map((cell, i) => padCell(cell, colWidths[i], alignments[i]))
          .join(" | ") +
        " |"
    );
  }
  return out;
}

export function formatMarkdownTables(
  markdown: string,
  targetLineZeroBased?: number
): { formatted: string; tablesFormatted: number } {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const output: string[] = [];
  let i = 0;
  let fenceChar: "`" | "~" | null = null;
  let fenceLen = 0;
  let tablesFormatted = 0;

  while (i < lines.length) {
    const line = lines[i];
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      const ch = marker[0] as "`" | "~";
      const rest = fenceMatch[2].trim();
      if (!fenceChar) {
        fenceChar = ch;
        fenceLen = marker.length;
      } else if (fenceChar === ch && marker.length >= fenceLen && rest === "") {
        fenceChar = null;
        fenceLen = 0;
      }
      output.push(line);
      i++;
      continue;
    }

    if (
      !fenceChar &&
      line.includes("|") &&
      i + 1 < lines.length &&
      isSeparatorLine(lines[i + 1])
    ) {
      const start = i;
      let end = i + 2;
      while (end < lines.length && lines[end].trim() !== "" && lines[end].includes("|")) {
        end++;
      }

      const shouldFormat =
        targetLineZeroBased === undefined ||
        (targetLineZeroBased >= start && targetLineZeroBased < end);

      const block = lines.slice(start, end);
      if (shouldFormat) {
        output.push(...formatSingleTable(block));
        tablesFormatted++;
      } else {
        output.push(...block);
      }
      i = end;
      continue;
    }

    output.push(line);
    i++;
  }

  return {
    formatted: output.join("\n"),
    tablesFormatted,
  };
}

export function generateMarkdownTable(rows: number, cols: number): string {
  const safeRows = Math.max(1, Math.min(20, rows));
  const safeCols = Math.max(1, Math.min(12, cols));

  const header =
    "| " + Array.from({ length: safeCols }, (_, i) => `列 ${i + 1}`).join(" | ") + " |";
  const sep = "| " + Array.from({ length: safeCols }, () => "---").join(" | ") + " |";
  const body = Array.from(
    { length: safeRows },
    () => "| " + Array.from({ length: safeCols }, () => "   ").join(" | ") + " |"
  );

  return formatSingleTable([header, sep, ...body]).join("\n");
}
