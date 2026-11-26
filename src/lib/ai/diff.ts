export type DiffHunkType = "equal" | "removed" | "added";

export interface DiffHunk {
  type: DiffHunkType;
  text: string;
}

export interface DiffStats {
  addedLines: number;
  removedLines: number;
  equalLines: number;
}

export interface LineDiffResult {
  hunks: DiffHunk[];
  stats: DiffStats;
}

const MAX_LCS_CELLS = 250_000;

function splitLines(text: string): string[] {
  if (text === "") return [];
  return text.split(/\r?\n/);
}

/**
 * Computes a lightweight line-level diff between `original` and `modified`
 * using common prefix/suffix trimming followed by LCS backtracking.
 */
export function computeLineDiff(
  original: string,
  modified: string
): DiffHunk[] {
  const a = splitLines(original);
  const b = splitLines(modified);

  if (a.length === 0 && b.length === 0) {
    return [];
  }
  if (a.length === 0) {
    return b.map((text) => ({ type: "added", text }));
  }
  if (b.length === 0) {
    return a.map((text) => ({ type: "removed", text }));
  }

  let prefixLen = 0;
  const minLen = Math.min(a.length, b.length);
  while (prefixLen < minLen && a[prefixLen] === b[prefixLen]) {
    prefixLen++;
  }

  let suffixLen = 0;
  while (
    suffixLen < minLen - prefixLen &&
    a[a.length - 1 - suffixLen] === b[b.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const hunks: DiffHunk[] = [];
  for (let i = 0; i < prefixLen; i++) {
    hunks.push({ type: "equal", text: a[i] });
  }

  const midA = a.slice(prefixLen, a.length - suffixLen);
  const midB = b.slice(prefixLen, b.length - suffixLen);
  const m = midA.length;
  const n = midB.length;

  if (m === 0 && n > 0) {
    for (const line of midB) {
      hunks.push({ type: "added", text: line });
    }
  } else if (n === 0 && m > 0) {
    for (const line of midA) {
      hunks.push({ type: "removed", text: line });
    }
  } else if (m > 0 && n > 0) {
    if (m * n > MAX_LCS_CELLS) {
      for (const line of midA) {
        hunks.push({ type: "removed", text: line });
      }
      for (const line of midB) {
        hunks.push({ type: "added", text: line });
      }
    } else {
      const cols = n + 1;
      const dp = new Int32Array((m + 1) * cols);

      for (let i = m - 1; i >= 0; i--) {
        const rowOffset = i * cols;
        const nextRowOffset = (i + 1) * cols;
        for (let j = n - 1; j >= 0; j--) {
          if (midA[i] === midB[j]) {
            dp[rowOffset + j] = dp[nextRowOffset + j + 1] + 1;
          } else {
            const down = dp[nextRowOffset + j];
            const right = dp[rowOffset + j + 1];
            dp[rowOffset + j] = down >= right ? down : right;
          }
        }
      }

      let i = 0;
      let j = 0;
      while (i < m && j < n) {
        if (midA[i] === midB[j]) {
          hunks.push({ type: "equal", text: midA[i] });
          i++;
          j++;
        } else if (dp[(i + 1) * cols + j] >= dp[i * cols + j + 1]) {
          hunks.push({ type: "removed", text: midA[i] });
          i++;
        } else {
          hunks.push({ type: "added", text: midB[j] });
          j++;
        }
      }
      while (i < m) {
        hunks.push({ type: "removed", text: midA[i] });
        i++;
      }
      while (j < n) {
        hunks.push({ type: "added", text: midB[j] });
        j++;
      }
    }
  }

  for (let i = a.length - suffixLen; i < a.length; i++) {
    hunks.push({ type: "equal", text: a[i] });
  }

  return hunks;
}

/**
 * Computes summary line counts from an array of diff hunks.
 */
export function summarizeLineDiff(hunks: DiffHunk[]): DiffStats {
  let addedLines = 0;
  let removedLines = 0;
  let equalLines = 0;
  for (const hunk of hunks) {
    if (hunk.type === "added") addedLines++;
    else if (hunk.type === "removed") removedLines++;
    else equalLines++;
  }
  return { addedLines, removedLines, equalLines };
}

/**
 * Computes both line diff hunks and summary line counts in one call.
 */
export function computeLineDiffWithStats(
  original: string,
  modified: string
): LineDiffResult {
  const hunks = computeLineDiff(original, modified);
  return {
    hunks,
    stats: summarizeLineDiff(hunks),
  };
}
