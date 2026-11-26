export interface TriggerDocumentPrintOptions {
  /** Temporary document title used as default PDF filename by OS print dialogs */
  title?: string;
  /** Fallback timeout (ms) to restore title & print class if `afterprint` never fires */
  fallbackTimeoutMs?: number;
}

export const PRINTING_DOCUMENT_CLASS = "hexo-printing";
const DEFAULT_FALLBACK_TIMEOUT_MS = 60_000;

let activePrintCleanup: (() => void) | null = null;

/**
 * Triggers native browser / WebView print (for printing or Save as PDF).
 * Temporarily updates `document.title` so OS PDF dialogs prefill the article title,
 * marks the document with `hexo-printing`, and reliably restores both on `afterprint`
 * or via fallback timeout.
 */
export function triggerDocumentPrint(
  options?: TriggerDocumentPrintOptions
): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  // Flush any prior unfinished cleanup so `previousTitle` is always the true original title
  if (activePrintCleanup) {
    activePrintCleanup();
  }

  const previousTitle = document.title;
  const sanitizedTitle = options?.title?.replace(/[\r\n\t]+/g, " ").trim();
  const fallbackMs = Math.max(
    50,
    options?.fallbackTimeoutMs ?? DEFAULT_FALLBACK_TIMEOUT_MS
  );

  let cleaned = false;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (fallbackTimer !== null) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    window.removeEventListener("afterprint", cleanup);
    document.documentElement.classList.remove(PRINTING_DOCUMENT_CLASS);
    document.body?.classList.remove(PRINTING_DOCUMENT_CLASS);
    document.title = previousTitle;
    if (activePrintCleanup === cleanup) {
      activePrintCleanup = null;
    }
  };

  activePrintCleanup = cleanup;

  if (sanitizedTitle) {
    document.title = sanitizedTitle;
  }
  document.documentElement.classList.add(PRINTING_DOCUMENT_CLASS);
  document.body?.classList.add(PRINTING_DOCUMENT_CLASS);

  window.addEventListener("afterprint", cleanup, { once: true });
  fallbackTimer = setTimeout(cleanup, fallbackMs);

  try {
    window.print();
  } catch (err) {
    cleanup();
    throw err;
  }

  return cleanup;
}
