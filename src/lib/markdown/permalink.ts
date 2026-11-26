import { parseMarkdownDocument } from "@/lib/frontmatter";

export interface BuildHexoPostUrlParams {
  serverUrl: string | null | undefined;
  siteRoot: string | null | undefined;
  sourceDir?: string | null;
  filePath: string | null | undefined;
  content: string;
  isDraft?: boolean;
  isStandalone?: boolean;
  permalink?: string | null;
  root?: string | null;
  modifiedMs?: number;
}

interface ParsedDateParts {
  year: string;
  month: string;
  iMonth: string;
  day: string;
  iDay: string;
}

function parseDateParts(rawDate: string | undefined, fallbackMs?: number): ParsedDateParts {
  const trimmed = (rawDate ?? "").trim();
  const dateMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (dateMatch) {
    const year = dateMatch[1];
    const mNum = parseInt(dateMatch[2], 10);
    const dNum = parseInt(dateMatch[3], 10);
    if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
      return {
        year,
        month: String(mNum).padStart(2, "0"),
        iMonth: String(mNum),
        day: String(dNum).padStart(2, "0"),
        iDay: String(dNum),
      };
    }
  }

  const parsed = trimmed ? new Date(trimmed) : null;
  const dateObj =
    parsed && !Number.isNaN(parsed.getTime())
      ? parsed
      : new Date(fallbackMs && Number.isFinite(fallbackMs) ? fallbackMs : Date.now());

  const year = String(dateObj.getFullYear());
  const mNum = dateObj.getMonth() + 1;
  const dNum = dateObj.getDate();
  return {
    year,
    month: String(mNum).padStart(2, "0"),
    iMonth: String(mNum),
    day: String(dNum).padStart(2, "0"),
    iDay: String(dNum),
  };
}

function normalizePathSlashes(input: string): string {
  return input.replace(/\\/g, "/").replace(/\/+$/, "");
}

function extractPostRelativeSlug(
  filePath: string,
  siteRoot: string,
  sourceDir: string
): string | null {
  const normFile = filePath.replace(/\\/g, "/");
  const normRoot = normalizePathSlashes(siteRoot);
  const cleanSource = sourceDir.trim().replace(/^\/+|\/+$/g, "") || "source";
  const postsPrefix = `${normRoot}/${cleanSource}/_posts/`;

  if (!normFile.startsWith(postsPrefix)) {
    return null;
  }
  const rel = normFile.slice(postsPrefix.length);
  const withoutExt = rel.replace(/\.(md|markdown|mdx)$/i, "");
  return withoutExt || null;
}

function encodeUrlPathPreservingSlashes(rawPath: string): string {
  const trailingSlash = rawPath.endsWith("/");
  const clean = rawPath.replace(/^\/+|\/+$/g, "");
  if (!clean) return "";
  const encodedSegments = clean
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg));
  return `${encodedSegments.join("/")}${trailingSlash ? "/" : ""}`;
}

/**
 * Builds the exact local preview URL for the active Hexo post using site
 * `_config.yml` `permalink` & `root` plus the post's front-matter `date`/`abbrlink`.
 * Safely falls back to `null` (so callers use site home `serverUrl`) for drafts,
 * standalone files, or invalid server URLs.
 */
export function buildHexoPostUrl(params: BuildHexoPostUrlParams): string | null {
  const {
    serverUrl,
    siteRoot,
    sourceDir = "source",
    filePath,
    content,
    isDraft = false,
    isStandalone = false,
    permalink,
    root,
    modifiedMs,
  } = params;

  if (!serverUrl || !siteRoot || !filePath || isStandalone || isDraft) {
    return null;
  }

  let base: URL;
  try {
    base = new URL(serverUrl);
    if (base.protocol !== "http:" && base.protocol !== "https:") {
      return null;
    }
  } catch {
    return null;
  }

  const relSlug = extractPostRelativeSlug(
    filePath,
    siteRoot,
    sourceDir || "source"
  );
  if (!relSlug) {
    return null;
  }

  const fileNameStem = relSlug.split("/").pop() || relSlug;
  const parsed = parseMarkdownDocument(content);
  const dateParts = parseDateParts(parsed.data.date, modifiedMs);
  const abbrlink = parsed.data.abbrlink.trim();

  let pattern = (permalink || ":year/:month/:day/:title/").trim();
  if (!pattern) {
    pattern = ":year/:month/:day/:title/";
  }

  // Fallback to default permalink if pattern requires abbrlink/id missing from post
  if (
    (pattern.includes(":abbrlink") && !abbrlink) ||
    pattern.includes(":id")
  ) {
    pattern = ":year/:month/:day/:title/";
  }

  const formattedPath = pattern
    .replace(/:year\b/g, dateParts.year)
    .replace(/:month\b/g, dateParts.month)
    .replace(/:i_month\b/g, dateParts.iMonth)
    .replace(/:day\b/g, dateParts.day)
    .replace(/:i_day\b/g, dateParts.iDay)
    .replace(/:title\b/g, relSlug)
    .replace(/:name\b/g, fileNameStem)
    .replace(/:post_title\b/g, relSlug)
    .replace(/:abbrlink\b/g, abbrlink)
    .replace(/:category\b/g, parsed.data.categories[0] || "uncategorized");

  const encodedRelative = encodeUrlPathPreservingSlashes(formattedPath);
  if (!encodedRelative) return base.toString();

  // Combine server base pathname / site root cleanly without duplicating root prefix
  const cleanRoot = (root || "/").trim();
  const normalizedRoot = cleanRoot.startsWith("/")
    ? cleanRoot.endsWith("/")
      ? cleanRoot
      : `${cleanRoot}/`
    : `/${cleanRoot}/`;

  const basePath = base.pathname.endsWith("/")
    ? base.pathname
    : `${base.pathname}/`;
  const effectiveRoot =
    basePath !== "/" ? basePath : normalizedRoot;

  return new URL(encodedRelative, `${base.origin}${effectiveRoot}`).toString();
}
