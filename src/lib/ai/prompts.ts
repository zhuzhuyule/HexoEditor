import { parseMarkdownDocument } from "@/lib/frontmatter";
import type {
  AiPromptAction,
  SiteContextSnapshot,
  SuggestedFrontMatter,
} from "@/types/ai";

export interface PromptBuildInput {
  action: AiPromptAction;
  siteContext?: SiteContextSnapshot | null;
  documentContent: string;
  selectionText?: string;
  terminalLogs?: string[];
  customInstruction?: string;
  targetLanguage?: "zh" | "en";
}

export interface BuiltAiPrompt {
  systemPrompt: string;
  userPrompt: string;
}

const MAX_BODY_CHARS = 8000;

function trimBodyWithBudget(body: string, maxChars = MAX_BODY_CHARS): string {
  const trimmed = body.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const head = trimmed.slice(0, Math.floor(maxChars * 0.65));
  const tail = trimmed.slice(-Math.floor(maxChars * 0.3));
  return `${head}\n\n...[truncated ${trimmed.length - head.length - tail.length} chars]...\n\n${tail}`;
}

export function formatSiteContextSummary(
  ctx: SiteContextSnapshot | null | undefined
): string {
  if (!ctx) {
    return "No active blog site directory (standalone Markdown mode).";
  }

  const lines: string[] = [
    `Engine: ${ctx.engine}`,
    `Site Title: ${ctx.siteTitle}`,
    `Language: ${ctx.language || "zh-CN"}`,
    `Permalink: ${ctx.permalink || ":year/:month/:day/:title/"}`,
    `post_asset_folder: ${ctx.postAssetFolder ? "true" : "false"}`,
  ];

  if (ctx.theme) lines.push(`Theme: ${ctx.theme}`);
  lines.push(
    `Markdown Features: breaks=${ctx.markdownConfig.breaks ?? "default"}, math=${ctx.markdownConfig.mathEnabled}, mermaid=${ctx.markdownConfig.mermaidEnabled}`
  );

  if (ctx.enabledThemeTags.length > 0) {
    lines.push(`Enabled Theme Tags: ${ctx.enabledThemeTags.join(", ")}`);
  }
  if (ctx.existingCategories.length > 0) {
    lines.push(
      `Existing Categories: ${ctx.existingCategories.slice(0, 20).join(", ")}`
    );
  }
  if (ctx.existingTags.length > 0) {
    lines.push(`Existing Tags: ${ctx.existingTags.slice(0, 30).join(", ")}`);
  }
  if (ctx.activeDoc) {
    lines.push(`Active Document: ${ctx.activeDoc.relativePath}`);
    if (ctx.activeDoc.localImages.length > 0) {
      lines.push(
        `Local Asset Images: ${ctx.activeDoc.localImages.slice(0, 20).join(", ")}`
      );
    }
  }

  return lines.join("\n");
}

export function buildSiteAwarePrompt(input: PromptBuildInput): BuiltAiPrompt {
  const parsed = parseMarkdownDocument(input.documentContent);
  const ctxSummary = formatSiteContextSummary(input.siteContext);
  const siteLang = input.siteContext?.language || "zh-CN";
  const selection = input.selectionText?.trim() || "";
  const bodyBudget = trimBodyWithBudget(parsed.body);

  const systemPrompt = [
    "You are an expert technical writing & static-site assistant inside HexoEditor V2.",
    "Always respect the active site's configuration, taxonomy vocabulary, Markdown/LaTeX syntax, and enabled theme tags.",
    "Never invent theme tags that are not listed under Enabled Theme Tags.",
    "Do not edit files on disk directly; output clean text/JSON as requested for editor confirmation.",
    "",
    "=== SiteContextSnapshot ===",
    ctxSummary,
  ].join("\n");

  switch (input.action) {
    case "frontmatter_complete": {
      const currentFm = parsed.hasFrontMatter
        ? JSON.stringify(
            {
              title: parsed.data.title,
              categories: parsed.data.categories,
              tags: parsed.data.tags,
              description: parsed.data.extra.description ?? "",
            },
            null,
            2
          )
        : "{}";

      const userPrompt = [
        "Analyze the article below and generate/complete its Front-Matter metadata.",
        `Match the site language (${siteLang}).`,
        "Prefer reusing existing categories and tags from Existing Categories / Existing Tags to prevent duplicate synonyms; introduce new tags only if clearly necessary.",
        "Also suggest a concise 1-2 sentence summary suitable before `<!-- more -->` if helpful.",
        "",
        "Return ONLY a valid JSON object (no markdown fences) with this exact schema:",
        `{`,
        `  "title": "string",`,
        `  "description": "string (concise SEO summary, 40-120 chars)",`,
        `  "categories": ["string"],`,
        `  "tags": ["string"],`,
        `  "summaryExcerpt": "string (optional short lead paragraph before <!-- more -->)"`,
        `}`,
        "",
        `Current Front-Matter: ${currentFm}`,
        "",
        "Article Body:",
        bodyBudget || "(empty document)",
      ].join("\n");
      return { systemPrompt, userPrompt };
    }

    case "polish": {
      const targetText = selection || bodyBudget;
      const scopeLabel = selection ? "selected excerpt" : "article body";
      const userPrompt = [
        `Polish and improve the clarity, flow, and technical precision of the ${scopeLabel} below.`,
        `Keep the tone consistent with site language (${siteLang}).`,
        "Strictly preserve Markdown structure, code blocks, inline code, KaTeX/LaTeX math ($...$ / $$...$$), links, image paths, and Hexo tags ({% ... %}).",
        "Output ONLY the polished Markdown text without extra commentary.",
        "",
        targetText,
      ].join("\n");
      return { systemPrompt, userPrompt };
    }

    case "translate": {
      const targetText = selection || bodyBudget;
      const hasCjk = /[\u4e00-\u9fff]/.test(targetText);
      const direction =
        input.targetLanguage === "en"
          ? "Chinese to English"
          : input.targetLanguage === "zh"
            ? "English to Chinese"
            : hasCjk
              ? "Chinese to natural technical English"
              : "English to natural technical Chinese";

      const userPrompt = [
        `Translate the following Markdown content from ${direction}.`,
        "Preserve all Markdown formatting, code blocks, identifiers, URLs, image references, LaTeX math formulas, and Hexo tags ({% ... %}).",
        "Output ONLY the translated Markdown.",
        "",
        targetText,
      ].join("\n");
      return { systemPrompt, userPrompt };
    }

    case "theme_format": {
      const enabledTags = input.siteContext?.enabledThemeTags ?? [];
      const mathAllowed = Boolean(input.siteContext?.markdownConfig.mathEnabled);
      const mermaidAllowed = Boolean(
        input.siteContext?.markdownConfig.mermaidEnabled
      );
      const targetText = selection || bodyBudget;

      const userPrompt = [
        "Upgrade the structure and readability of the Markdown content below using ONLY features enabled in this site:",
        `- Enabled Theme Tags: ${enabledTags.length > 0 ? enabledTags.join(", ") : "none (standard Markdown only)"}`,
        `- Mermaid Diagrams Allowed: ${mermaidAllowed ? "yes (```mermaid)" : "no"}`,
        `- Math Formulas Allowed: ${mathAllowed ? "yes ($...$ / $$...$$)" : "no"}`,
        "Do NOT use any theme tag that is not in Enabled Theme Tags.",
        "For example, if `note` is enabled, convert callout blockquotes into `{% note info %} ... {% endnote %}` where appropriate; if `tabs` is enabled, group parallel code/platform steps only when clearly helpful.",
        "Output ONLY the formatted Markdown.",
        "",
        targetText,
      ].join("\n");
      return { systemPrompt, userPrompt };
    }

    case "image_caption": {
      const localImages = input.siteContext?.activeDoc?.localImages ?? [];
      const postAsset = Boolean(input.siteContext?.postAssetFolder);
      const userPrompt = [
        "Inspect the article body and the local image assets listed below.",
        `post_asset_folder is ${postAsset ? "true (prefer bare filename like ![alt](image.png) or {% asset_img image.png alt %})" : "false (prefer /images/... paths)"}.`,
        "1. Identify any local asset images not yet referenced in the article and suggest where/how to insert them.",
        "2. Suggest descriptive alt texts / captions for images with missing or generic alt text.",
        `Local Asset Images: ${localImages.length > 0 ? localImages.join(", ") : "(none detected)"}`,
        "",
        "Article Body:",
        bodyBudget,
      ].join("\n");
      return { systemPrompt, userPrompt };
    }

    case "diagnose_terminal": {
      const logs = (input.terminalLogs ?? []).slice(-60).join("\n");
      const userPrompt = [
        "Diagnose the Hexo / static-site terminal error logs below together with the active site configuration.",
        "Identify the root cause (e.g., disabled mathjax/katex, post_asset_folder mismatch, port in use, missing plugin, invalid YAML front-matter) and provide exact, copyable fix steps.",
        "",
        "Recent Terminal Logs:",
        logs || "(no terminal logs captured)",
      ].join("\n");
      return { systemPrompt, userPrompt };
    }

    case "custom":
    default: {
      const instruction =
        input.customInstruction?.trim() || "Review and improve this article.";
      const contextSnippet = selection || bodyBudget;
      const userPrompt = [
        instruction,
        "",
        contextSnippet
          ? `Context (${selection ? "Selection" : "Current Document"}):\n${contextSnippet}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
      return { systemPrompt, userPrompt };
    }
  }
}

/**
 * Extracts structured Front-Matter suggestions from an AI response
 * (supports raw JSON, ```json fenced JSON, or simple YAML fallback).
 */
export function parseSuggestedFrontMatter(
  raw: string
): SuggestedFrontMatter | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenceMatch ? fenceMatch[1] : trimmed).trim();
  const jsonStart = candidate.indexOf("{");
  const jsonEnd = candidate.lastIndexOf("}");

  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    try {
      const parsed = JSON.parse(candidate.slice(jsonStart, jsonEnd + 1)) as Record<
        string,
        unknown
      >;
      const toStrArray = (v: unknown): string[] | undefined => {
        if (!Array.isArray(v)) return undefined;
        const arr = v
          .map((item) => String(item).trim())
          .filter(Boolean);
        return arr.length > 0 ? Array.from(new Set(arr)) : [];
      };

      const title =
        typeof parsed.title === "string" && parsed.title.trim()
          ? parsed.title.trim()
          : undefined;
      const description =
        typeof parsed.description === "string" && parsed.description.trim()
          ? parsed.description.trim()
          : undefined;
      const summaryExcerpt =
        typeof parsed.summaryExcerpt === "string" && parsed.summaryExcerpt.trim()
          ? parsed.summaryExcerpt.trim()
          : undefined;

      return {
        title,
        description,
        categories: toStrArray(parsed.categories),
        tags: toStrArray(parsed.tags),
        summaryExcerpt,
      };
    } catch {
      return null;
    }
  }

  return null;
}
