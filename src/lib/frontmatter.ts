import yaml from "js-yaml";

import type { FrontMatterData } from "@/types";

export interface ParsedDocument {
  hasFrontMatter: boolean;
  data: FrontMatterData;
  body: string;
  /** 1-based line number in the raw markdown where body starts */
  bodyStartLine: number;
  /** Non-empty when YAML front-matter currently has a syntax error */
  parseError?: string;
}

const FRONT_MATTER_RE = /^---[ \t]*\n(?:([\s\S]*?)\n)?---[ \t]*(?:\n|$)/;

function matchFrontMatterBlock(normalized: string): RegExpMatchArray | null {
  return normalized.match(FRONT_MATTER_RE);
}

function computeBodyStartLineFromMatch(matched: string): number {
  const lineCount = matched.endsWith("\n")
    ? matched.split("\n").length - 1
    : matched.split("\n").length;
  return lineCount + 1;
}

function normalizeStringList(val: unknown): string[] {
  if (val == null) return [];
  if (typeof val === "string") {
    const trimmed = val.trim();
    return trimmed ? [trimmed] : [];
  }
  if (typeof val === "number") return [String(val)];
  if (Array.isArray(val)) {
    const out: string[] = [];
    for (const item of val) {
      out.push(...normalizeStringList(item));
    }
    return out;
  }
  return [];
}

function formatDateValue(val: unknown): string {
  if (val == null) return "";
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${val.getUTCFullYear()}-${pad(val.getUTCMonth() + 1)}-${pad(val.getUTCDate())} ${pad(
      val.getUTCHours()
    )}:${pad(val.getUTCMinutes())}:${pad(val.getUTCSeconds())}`;
  }
  return String(val).trim();
}

export function formatCurrentLocalDate(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
    now.getHours()
  )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

export function parseMarkdownDocument(raw: string): ParsedDocument {
  const normalized = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");

  const emptyData: FrontMatterData = {
    title: "",
    date: "",
    updated: "",
    tags: [],
    categories: [],
    abbrlink: "",
    extra: {},
  };

  const fmMatch = matchFrontMatterBlock(normalized);
  if (!fmMatch) {
    return {
      hasFrontMatter: false,
      data: emptyData,
      body: normalized,
      bodyStartLine: 1,
    };
  }

  const matchedBlock = fmMatch[0];
  const yamlText = fmMatch[1] ?? "";
  const body = normalized.slice(matchedBlock.length);
  const bodyStartLine = computeBodyStartLineFromMatch(matchedBlock);

  try {
    let rawObj: Record<string, unknown> = {};
    if (yamlText.trim().length > 0) {
      const loaded = yaml.load(yamlText, { schema: yaml.JSON_SCHEMA });
      if (loaded === null || loaded === undefined) {
        rawObj = {};
      } else if (typeof loaded === "object" && !Array.isArray(loaded)) {
        rawObj = loaded as Record<string, unknown>;
      } else {
        throw new Error("Front-matter must be a YAML mapping object");
      }
    }

    const knownKeys = new Set(["title", "date", "updated", "tags", "categories", "abbrlink"]);
    const extra: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rawObj)) {
      if (!knownKeys.has(k)) {
        extra[k] = v;
      }
    }

    return {
      hasFrontMatter: true,
      data: {
        title: rawObj.title != null ? String(rawObj.title) : "",
        date: formatDateValue(rawObj.date),
        updated: formatDateValue(rawObj.updated),
        tags: normalizeStringList(rawObj.tags),
        categories: normalizeStringList(rawObj.categories),
        abbrlink: rawObj.abbrlink != null ? String(rawObj.abbrlink) : "",
        extra,
      },
      body,
      bodyStartLine,
    };
  } catch (err) {
    // Graceful fallback if user is mid-typing invalid YAML
    const parseError = err instanceof Error ? err.message : String(err);
    return {
      hasFrontMatter: true,
      data: emptyData,
      body,
      bodyStartLine,
      parseError,
    };
  }
}

export function serializeMarkdownDocument(
  data: FrontMatterData,
  body: string
): string {
  const ordered: Record<string, unknown> = {};

  if (data.title !== undefined) {
    ordered.title = data.title;
  }
  if (data.date) {
    ordered.date = data.date;
  }
  if (data.updated) {
    ordered.updated = data.updated;
  }
  if (data.tags.length > 0) {
    ordered.tags = data.tags;
  }
  if (data.categories.length > 0) {
    ordered.categories = data.categories;
  }
  if (data.abbrlink) {
    ordered.abbrlink = data.abbrlink;
  }

  for (const [k, v] of Object.entries(data.extra)) {
    if (v !== undefined) {
      ordered[k] = v;
    }
  }

  const dumped = yaml
    .dump(ordered, {
      lineWidth: -1,
      noRefs: true,
      quotingType: '"',
      forceQuotes: false,
    })
    .trimEnd();

  const normalizedBody = body.replace(/^\n*/, "");
  const separator = normalizedBody.length > 0 ? "\n\n" : "\n";
  return `---\n${dumped}\n---${separator}${normalizedBody}`;
}

export function updateFrontMatterInMarkdown(
  raw: string,
  updater: (current: FrontMatterData) => FrontMatterData
): string {
  const parsed = parseMarkdownDocument(raw);
  if (parsed.parseError) {
    return raw;
  }
  const nextData = updater(parsed.data);
  return serializeMarkdownDocument(nextData, parsed.body);
}
