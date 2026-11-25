import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

let cachedService: TurndownService | null = null;

function getTurndown(): TurndownService {
  if (cachedService) return cachedService;
  const service = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    strongDelimiter: "**",
  });
  service.use(gfm);
  service.remove(["script", "style", "noscript", "meta", "link"]);
  cachedService = service;
  return service;
}

/**
 * Decides whether pasted clipboard HTML comes from rich web content
 * (should be converted to Markdown) vs. an IDE/plain-text copy.
 */
export function shouldConvertHtmlPaste(html: string, plainText: string): boolean {
  const trimmedHtml = html.trim();
  if (!trimmedHtml) return false;

  // VSCode / JetBrains / CodeMirror copies often wrap plain text in a single styled div/pre/span
  if (/data-vscode-context|vscode-editor-data|cm-content/i.test(trimmedHtml)) {
    return false;
  }

  // Must contain meaningful semantic HTML structure (headings, links, images, lists, tables, formatting, paragraphs)
  const hasRichTags = /<(h[1-6]|p|ul|ol|li|table|thead|tbody|tr|blockquote|pre|code|strong|b|em|i|a\s+href|img\s+src|del|s)\b/i.test(
    trimmedHtml
  );
  if (!hasRichTags) return false;

  // If plain text already looks strongly like raw Markdown syntax, keep plain text
  const looksLikeRawMarkdown =
    /(^|\n)(#{1,6}\s|```|!\[[^\]]*\]\(|\[[^\]]+\]\(https?:\/\/|\|[^|\n]+\|)/m.test(
      plainText
    );
  if (looksLikeRawMarkdown) return false;

  return true;
}

export function convertHtmlToMarkdown(html: string): string {
  const service = getTurndown();
  const converted = service.turndown(html);
  // Collapse excessive blank lines
  return converted.replace(/\n{3,}/g, "\n\n").trim();
}
