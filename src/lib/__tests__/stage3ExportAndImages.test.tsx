import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  formatBytes,
  ImageBedUploadDialog,
  type ImageBedConfigSummary,
  type ImageUploadStatusItem,
  type LocalDocumentImageItem,
  type UnusedImageItem,
} from "@/components/images/ImageBedUploadDialog";
import { buildStandaloneHtmlDocument } from "@/lib/export/htmlExport";
import {
  PRINTING_DOCUMENT_CLASS,
  triggerDocumentPrint,
} from "@/lib/export/printPdf";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe("buildStandaloneHtmlDocument", () => {
  it("escapes title and metadata to prevent XSS and strips </style> breakouts", async () => {
    const html = await buildStandaloneHtmlDocument({
      title: `Hello <script>alert("xss")</script> & 'World'`,
      date: `2026-11-25 <img src=x onerror=alert(1)>`,
      categories: [`Tech & <b>News</b>`],
      tags: [`"unsafe"<script>`],
      markdownContent: "# Hello",
      bodyHtml: `<p data-source-line="1">Safe paragraph</p>`,
      themeCss: `h1 { color: red; } </style><script>alert(2)</script> p { background: url(javascript:alert(3)); }`,
    });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain(
      "<title>Hello &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &#39;World&#39;</title>"
    );
    expect(html).toContain(
      "&lt;img src=x onerror=alert(1)&gt;"
    );
    expect(html).toContain("Tech &amp; &lt;b&gt;News&lt;/b&gt;");
    expect(html).toContain("#&quot;unsafe&quot;&lt;script&gt;");
    expect(html).not.toContain("javascript:alert");
    expect(html).toContain(".markdown-preview-scoped h1");
    expect(html).not.toContain("data-source-line");
  });

  it("inlines local images as Data URIs, deduplicates resolver calls, and strips editor attributes", async () => {
    const resolver = vi.fn(async (absPath: string) => {
      if (absPath === "/blog/source/_posts/demo/a.png") {
        return "data:image/png;base64,iVBORw0KGgo=";
      }
      if (absPath === "/blog/source/_posts/demo/b.webp") {
        return "data:image/webp;base64,UklGRh4AAABXRUJQ";
      }
      return null;
    });

    const bodyHtml = [
      `<p data-source-line="2"><img src="asset://localhost/a.png" data-local-image="true" data-local-abs-path="/blog/source/_posts/demo/a.png" data-raw-src="a.png" alt="A1" /></p>`,
      `<p data-source-line="4"><img src="asset://localhost/a.png" data-local-image="true" data-local-abs-path="/blog/source/_posts/demo/a.png" data-raw-src="a.png" alt="A2" /></p>`,
      `<p><img src="asset://localhost/b.webp" data-local-image="true" data-local-abs-path="/blog/source/_posts/demo/b.webp" data-raw-src="b.webp" alt="B" /></p>`,
      `<p><img src="https://cdn.example.com/remote.jpg" alt="Remote" /></p>`,
    ].join("\n");

    const html = await buildStandaloneHtmlDocument({
      title: "离线图片导出测试",
      markdownContent: "![A](a.png)",
      bodyHtml,
      resolveLocalImageDataUri: resolver,
    });

    expect(resolver).toHaveBeenCalledTimes(2);
    expect(html).toContain('src="data:image/png;base64,iVBORw0KGgo="');
    expect(html).toContain('src="data:image/webp;base64,UklGRh4AAABXRUJQ"');
    expect(html).toContain('src="https://cdn.example.com/remote.jpg"');
    expect(html).not.toContain("data-local-image");
    expect(html).not.toContain("data-local-abs-path");
    expect(html).not.toContain("data-raw-src");
    expect(html).not.toContain("data-source-line");
  });

  it("preserves original image src when resolving a single local image fails or rejects", async () => {
    const resolver = vi.fn(async (absPath: string) => {
      if (absPath === "/blog/ok.png") {
        return "data:image/png;base64,AAAA";
      }
      if (absPath === "/blog/throw.png") {
        throw new Error("Disk read failed");
      }
      return null;
    });

    const bodyHtml = [
      `<img src="asset://localhost/ok.png" data-local-image="true" data-local-abs-path="/blog/ok.png" alt="OK" />`,
      `<img src="asset://localhost/throw.png" data-local-image="true" data-local-abs-path="/blog/throw.png" alt="Throw" />`,
      `<img src="asset://localhost/missing.png" data-local-image="true" data-local-abs-path="/blog/missing.png" alt="Missing" />`,
    ].join("\n");

    const html = await buildStandaloneHtmlDocument({
      title: "Partial Failure Export",
      markdownContent: "",
      bodyHtml,
      resolveLocalImageDataUri: resolver,
    });

    expect(html).toContain('src="data:image/png;base64,AAAA"');
    expect(html).toContain('src="asset://localhost/throw.png"');
    expect(html).toContain('src="asset://localhost/missing.png"');
    expect(html).not.toContain("data-local-abs-path");
  });

  it("injects scoped theme CSS, selected code highlight theme, and conditional KaTeX styles", async () => {
    const withKatex = await buildStandaloneHtmlDocument({
      title: "Math Post",
      markdownContent: "$E=mc^2$",
      bodyHtml: `<div class="katex-display-wrapper"><span class="katex">E=mc^2</span></div>`,
      codeTheme: "atom-one-dark",
      themeCss: `body { font-family: Georgia, serif; } @import url("https://evil.test/x.css"); blockquote { border-color: #123456; }`,
    });

    expect(withKatex).toContain('data-code-theme="atom-one-dark"');
    expect(withKatex).toContain("#282c34");
    expect(withKatex).toContain("Offline KaTeX structural typography");
    expect(withKatex).toContain('data-hexo-theme-css="true"');
    expect(withKatex).toContain(".markdown-preview-scoped blockquote");
    expect(withKatex).not.toContain("@import");

    const withoutKatex = await buildStandaloneHtmlDocument({
      title: "Plain Post",
      markdownContent: "Hello world",
      bodyHtml: `<p>Hello world</p>`,
    });

    expect(withoutKatex).toContain('data-code-theme="github-light"');
    expect(withoutKatex).not.toContain("Offline KaTeX structural typography");
    expect(withoutKatex).not.toContain('data-hexo-theme-css="true"');
  });
});

describe("triggerDocumentPrint", () => {
  const originalTitle = document.title;

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.title = originalTitle;
    document.documentElement.classList.remove(PRINTING_DOCUMENT_CLASS);
    document.body.classList.remove(PRINTING_DOCUMENT_CLASS);
  });

  it("temporarily switches document.title and print class during window.print() and restores on afterprint", () => {
    document.title = "HexoEditor V2";
    let titleDuringPrint = "";
    let hasClassDuringPrint = false;

    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {
      titleDuringPrint = document.title;
      hasClassDuringPrint = document.documentElement.classList.contains(
        PRINTING_DOCUMENT_CLASS
      );
    });

    triggerDocumentPrint({ title: "我的 Hexo 文章\n标题" });

    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(titleDuringPrint).toBe("我的 Hexo 文章 标题");
    expect(hasClassDuringPrint).toBe(true);
    expect(document.title).toBe("我的 Hexo 文章 标题");

    window.dispatchEvent(new Event("afterprint"));

    expect(document.title).toBe("HexoEditor V2");
    expect(
      document.documentElement.classList.contains(PRINTING_DOCUMENT_CLASS)
    ).toBe(false);
    expect(document.body.classList.contains(PRINTING_DOCUMENT_CLASS)).toBe(
      false
    );
  });

  it("restores document.title via fallback timeout if afterprint never fires", () => {
    vi.useFakeTimers();
    document.title = "Original App Title";
    vi.spyOn(window, "print").mockImplementation(() => {});

    triggerDocumentPrint({ title: "PDF Export Name", fallbackTimeoutMs: 400 });
    expect(document.title).toBe("PDF Export Name");

    vi.advanceTimersByTime(450);

    expect(document.title).toBe("Original App Title");
    expect(
      document.documentElement.classList.contains(PRINTING_DOCUMENT_CLASS)
    ).toBe(false);
  });

  it("restores document.title immediately if window.print throws", () => {
    document.title = "Stable Title";
    vi.spyOn(window, "print").mockImplementation(() => {
      throw new Error("Print unavailable");
    });

    expect(() =>
      triggerDocumentPrint({ title: "Temporary PDF Title" })
    ).toThrow("Print unavailable");

    expect(document.title).toBe("Stable Title");
    expect(
      document.documentElement.classList.contains(PRINTING_DOCUMENT_CLASS)
    ).toBe(false);
  });
});

describe("ImageBedUploadDialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  const sampleLocalImages: LocalDocumentImageItem[] = [
    {
      rawSrc: "hero.png",
      absolutePath: "/blog/source/_posts/post-1/hero.png",
      fileName: "hero.png",
      sizeBytes: 24576,
    },
    {
      rawSrc: "diagram.webp",
      absolutePath: "/blog/source/_posts/post-1/diagram.webp",
      fileName: "diagram.webp",
      sizeBytes: 102400,
    },
  ];

  const sampleUnusedImages: UnusedImageItem[] = [
    {
      absolutePath: "/blog/source/_posts/post-1/old-1.png",
      fileName: "old-1.png",
      sizeBytes: 10240,
    },
    {
      absolutePath: "/blog/source/_posts/post-1/old-2.jpg",
      fileName: "old-2.jpg",
      sizeBytes: 30720,
    },
  ];

  const configuredS3: ImageBedConfigSummary = {
    provider: "s3",
    targetLabel: "cdn.example.com / blog-assets",
    configured: true,
    supportsRemoteDelete: true,
    keepLocalAfterUpload: true,
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("formats byte sizes cleanly", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(10240)).toBe("10.0 KB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.0 MB");
  });

  it("renders local image statuses, triggers batch upload, and conditionally shows undo with remote delete toggle", async () => {
    const onOpenChange = vi.fn();
    const onBatchUpload = vi.fn();
    const onUndoLastUpload = vi.fn();

    const uploadStatuses: Record<string, ImageUploadStatusItem> = {
      "/blog/source/_posts/post-1/hero.png": {
        absolutePath: "/blog/source/_posts/post-1/hero.png",
        status: "success",
        remoteUrl: "https://cdn.example.com/hero.png",
        remoteKey: "blog/hero.png",
      },
      "/blog/source/_posts/post-1/diagram.webp": {
        absolutePath: "/blog/source/_posts/post-1/diagram.webp",
        status: "error",
        error: "403 Access Denied",
      },
    };

    // Initially without lastUploadBatch -> undo button must NOT be shown
    await act(async () => {
      root.render(
        <ImageBedUploadDialog
          open={true}
          onOpenChange={onOpenChange}
          locale="zh-CN"
          localImages={sampleLocalImages}
          imageBedConfig={configuredS3}
          uploadStatuses={uploadStatuses}
          onBatchUpload={onBatchUpload}
          lastUploadBatch={null}
          onUndoLastUpload={onUndoLastUpload}
          unusedImages={sampleUnusedImages}
        />
      );
    });

    const dialogText = document.body.textContent ?? "";
    expect(dialogText).toContain("图片管理与图床上传");
    expect(dialogText).toContain("cdn.example.com / blog-assets");
    expect(dialogText).toContain("hero.png");
    expect(dialogText).toContain("https://cdn.example.com/hero.png");
    expect(dialogText).toContain("diagram.webp");
    expect(dialogText).toContain("403 Access Denied");
    expect(dialogText).not.toContain("撤销最近一次上传");

    const uploadBtn = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button")
    ).find((b) => b.textContent?.includes("一键批量上传"));
    expect(uploadBtn).toBeDefined();
    expect(uploadBtn!.disabled).toBe(false);

    await act(async () => {
      uploadBtn!.click();
    });
    expect(onBatchUpload).toHaveBeenCalledTimes(1);
    expect(onBatchUpload).toHaveBeenCalledWith(sampleLocalImages);

    // Re-render WITH lastUploadBatch -> undo button + remote delete option appear
    await act(async () => {
      root.render(
        <ImageBedUploadDialog
          open={true}
          onOpenChange={onOpenChange}
          locale="zh-CN"
          localImages={sampleLocalImages}
          imageBedConfig={configuredS3}
          uploadStatuses={uploadStatuses}
          onBatchUpload={onBatchUpload}
          lastUploadBatch={{
            uploadedCount: 1,
            canDeleteRemote: true,
            remoteKeyCount: 1,
          }}
          onUndoLastUpload={onUndoLastUpload}
          unusedImages={sampleUnusedImages}
        />
      );
    });

    const undoBtn = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button")
    ).find((b) => b.textContent?.includes("撤销最近一次上传"));
    expect(undoBtn).toBeDefined();

    // Default deleteRemote is false
    await act(async () => {
      undoBtn!.click();
    });
    expect(onUndoLastUpload).toHaveBeenLastCalledWith({ deleteRemote: false });

    // Check "同时删除远端文件" and click undo again
    const deleteRemoteCheckbox = Array.from(
      document.body.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    )[0];
    expect(deleteRemoteCheckbox).toBeDefined();
    await act(async () => {
      deleteRemoteCheckbox.click();
    });

    await act(async () => {
      undoBtn!.click();
    });
    expect(onUndoLastUpload).toHaveBeenLastCalledWith({ deleteRemote: true });
  });

  it("handles unused image selection, select-all/invert, rescan, and secondary delete confirmation", async () => {
    const onOpenChange = vi.fn();
    const onBatchUpload = vi.fn();
    const onScanUnused = vi.fn();
    const onDeleteUnused = vi.fn();

    await act(async () => {
      root.render(
        <ImageBedUploadDialog
          open={true}
          onOpenChange={onOpenChange}
          locale="zh-CN"
          localImages={sampleLocalImages}
          imageBedConfig={configuredS3}
          onBatchUpload={onBatchUpload}
          unusedImages={sampleUnusedImages}
          onScanUnused={onScanUnused}
          onDeleteUnused={onDeleteUnused}
        />
      );
    });

    // Switch to Tab 2 (清理未引用图片)
    const cleanupTab = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    ).find((tab) => tab.textContent?.includes("清理未引用图片"));
    expect(cleanupTab).toBeDefined();

    await act(async () => {
      cleanupTab!.click();
    });

    expect(document.body.textContent).toContain("old-1.png");
    expect(document.body.textContent).toContain("old-2.jpg");
    expect(document.body.textContent).toContain("40.0 KB");

    // Rescan button callback
    const rescanBtn = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button")
    ).find((b) => b.textContent?.includes("重新扫描"));
    expect(rescanBtn).toBeDefined();
    await act(async () => {
      rescanBtn!.click();
    });
    expect(onScanUnused).toHaveBeenCalledTimes(1);

    // Clean button is initially disabled when 0 selected
    const getCleanBtn = () =>
      Array.from(
        document.body.querySelectorAll<HTMLButtonElement>("button")
      ).find((b) => b.textContent?.includes("安全清理"));
    expect(getCleanBtn()?.disabled).toBe(true);

    // Check first unused image checkbox (index 0 is master "全选", index 1 is old-1.png)
    const checkboxes = Array.from(
      document.body.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    );
    expect(checkboxes).toHaveLength(3);

    await act(async () => {
      checkboxes[1].click();
    });
    expect(getCleanBtn()?.disabled).toBe(false);
    expect(getCleanBtn()?.textContent).toContain("(1)");

    // Invert selection -> selects old-2.jpg only
    const invertBtn = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button")
    ).find((b) => b.textContent?.trim() === "反选");
    expect(invertBtn).toBeDefined();
    await act(async () => {
      invertBtn!.click();
    });
    expect(checkboxes[1].checked).toBe(false);
    expect(checkboxes[2].checked).toBe(true);

    // Select all -> both selected
    await act(async () => {
      checkboxes[0].click();
    });
    expect(checkboxes[1].checked).toBe(true);
    expect(checkboxes[2].checked).toBe(true);
    expect(getCleanBtn()?.textContent).toContain("(2)");

    // Click Clean Selected -> enters secondary confirmation (does NOT delete yet!)
    await act(async () => {
      getCleanBtn()!.click();
    });
    expect(onDeleteUnused).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("确认永久删除选中的 2 张未引用图片");

    // Click Cancel -> aborts deletion
    const cancelBtn = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button")
    ).find((b) => b.textContent?.trim() === "取消");
    expect(cancelBtn).toBeDefined();
    await act(async () => {
      cancelBtn!.click();
    });
    expect(onDeleteUnused).not.toHaveBeenCalled();

    // Click Clean Selected again, then Confirm Delete -> calls onDeleteUnused with both paths
    await act(async () => {
      getCleanBtn()!.click();
    });
    const confirmBtn = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button")
    ).find((b) => b.textContent?.includes("确认删除"));
    expect(confirmBtn).toBeDefined();
    await act(async () => {
      confirmBtn!.click();
    });

    expect(onDeleteUnused).toHaveBeenCalledTimes(1);
    expect(onDeleteUnused).toHaveBeenCalledWith([
      "/blog/source/_posts/post-1/old-1.png",
      "/blog/source/_posts/post-1/old-2.jpg",
    ]);
  });

  it("renders English UI copy when locale is en-US and disables upload when unconfigured", async () => {
    const onOpenSettings = vi.fn();

    await act(async () => {
      root.render(
        <ImageBedUploadDialog
          open={true}
          onOpenChange={vi.fn()}
          locale="en-US"
          localImages={sampleLocalImages}
          imageBedConfig={{
            provider: "none",
            configured: false,
          }}
          onBatchUpload={vi.fn()}
          onOpenSettings={onOpenSettings}
          unusedImages={[]}
        />
      );
    });

    const text = document.body.textContent ?? "";
    expect(text).toContain("Image Manager & Bed Upload");
    expect(text).toContain("Batch Upload");
    expect(text).toContain("Unused Images");
    expect(text).toContain("Not Configured");

    const uploadBtn = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button")
    ).find((b) => b.textContent?.includes("Upload All"));
    expect(uploadBtn?.disabled).toBe(true);

    const settingsBtn = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button")
    ).find((b) => b.textContent?.includes("Settings"));
    expect(settingsBtn).toBeDefined();
    await act(async () => {
      settingsBtn!.click();
    });
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
