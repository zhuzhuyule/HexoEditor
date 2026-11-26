import { describe, expect, it } from "vitest";

import { buildHexoPostUrl } from "@/lib/markdown/permalink";

describe("buildHexoPostUrl", () => {
  it("builds default :year/:month/:day/:title/ URL with percent-encoded CJK slug", () => {
    const url = buildHexoPostUrl({
      serverUrl: "http://localhost:4000/",
      siteRoot: "/Users/zac/code/github/hexo-demo",
      sourceDir: "source",
      filePath:
        "/Users/zac/code/github/hexo-demo/source/_posts/HexoEditor-V2-全特性验收.md",
      content: "---\ntitle: HexoEditor V2 全特性验收指南\ndate: 2026-11-26 10:30:00\n---\n\n正文",
      permalink: ":year/:month/:day/:title/",
      root: "/",
    });

    expect(url).toBe(
      "http://localhost:4000/2026/11/26/HexoEditor-V2-%E5%85%A8%E7%89%B9%E6%80%A7%E9%AA%8C%E6%94%B6/"
    );
  });

  it("supports nested post directories, custom :abbrlink.html, and site root subpath", () => {
    const nestedUrl = buildHexoPostUrl({
      serverUrl: "http://localhost:4000/",
      siteRoot: "/blog",
      filePath: "/blog/source/_posts/rust/tauri-guide.md",
      content: "---\ntitle: Tauri\ndate: 2026-05-03 08:00:00\n---\n",
      permalink: ":year/:i_month/:i_day/:title/",
      root: "/subblog/",
    });
    expect(nestedUrl).toBe(
      "http://localhost:4000/subblog/2026/5/3/rust/tauri-guide/"
    );

    const abbrUrl = buildHexoPostUrl({
      serverUrl: "http://localhost:4000/subblog/",
      siteRoot: "/blog",
      filePath: "/blog/source/_posts/my-post.md",
      content: "---\ntitle: Abbr\ndate: 2026-05-03\nabbrlink: a1b2c3d4\n---\n",
      permalink: "posts/:abbrlink.html",
      root: "/subblog/",
    });
    expect(abbrUrl).toBe("http://localhost:4000/subblog/posts/a1b2c3d4.html");
  });

  it("falls back cleanly to null for drafts, standalone files, or missing serverUrl", () => {
    expect(
      buildHexoPostUrl({
        serverUrl: "http://localhost:4000/",
        siteRoot: "/blog",
        filePath: "/blog/source/_drafts/draft.md",
        content: "---\ntitle: Draft\n---\n",
        isDraft: true,
      })
    ).toBeNull();

    expect(
      buildHexoPostUrl({
        serverUrl: "http://localhost:4000/",
        siteRoot: "/blog",
        filePath: "/tmp/other.md",
        content: "# Standalone",
        isStandalone: true,
      })
    ).toBeNull();

    expect(
      buildHexoPostUrl({
        serverUrl: null,
        siteRoot: "/blog",
        filePath: "/blog/source/_posts/hello.md",
        content: "---\ntitle: Hello\ndate: 2026-11-26\n---\n",
      })
    ).toBeNull();
  });

  it("uses modifiedMs fallback date when front-matter date is absent", () => {
    const ms = new Date(2026, 0, 9, 12, 0, 0).getTime();
    const url = buildHexoPostUrl({
      serverUrl: "http://localhost:4000",
      siteRoot: "/blog",
      filePath: "/blog/source/_posts/no-date.md",
      content: "---\ntitle: No Date\n---\n",
      modifiedMs: ms,
    });
    expect(url).toBe("http://localhost:4000/2026/01/09/no-date/");
  });

  it("builds Hugo Page Bundle and standalone post URLs including drafts", () => {
    expect(
      buildHexoPostUrl({
        engine: "hugo",
        serverUrl: "http://localhost:1313/",
        siteRoot: "/Users/zac/my-blog",
        sourceDir: "content",
        filePath: "/Users/zac/my-blog/content/posts/blog-setup/index.md",
        content: "---\ntitle: Blog Setup\ndraft: true\n---\n",
        isDraft: true,
      })
    ).toBe("http://localhost:1313/posts/blog-setup/");

    expect(
      buildHexoPostUrl({
        engine: "hugo",
        serverUrl: "http://localhost:1313/",
        siteRoot: "/Users/zac/my-blog",
        sourceDir: "content",
        filePath: "/Users/zac/my-blog/content/Posts/我的文章.md",
        content: "+++\ntitle = \"我的文章\"\ndraft = false\n+++\n",
      })
    ).toBe("http://localhost:1313/posts/%E6%88%91%E7%9A%84%E6%96%87%E7%AB%A0/");

    expect(
      buildHexoPostUrl({
        engine: "hugo",
        serverUrl: "http://localhost:1313/",
        siteRoot: "/Users/zac/my-blog",
        sourceDir: "content",
        filePath: "/Users/zac/my-blog/content/post/hello/index.md",
        content: "---\ntitle: Hello\n---\n",
      })
    ).toBe("http://localhost:1313/post/hello/");

    expect(
      buildHexoPostUrl({
        engine: "hugo",
        serverUrl: "http://localhost:1313/",
        siteRoot: "/Users/zac/my-blog",
        sourceDir: "content",
        filePath: "/Users/zac/my-blog/content/posts/_index.md",
        content: "---\ntitle: Posts\n---\n",
      })
    ).toBeNull();
  });
});
