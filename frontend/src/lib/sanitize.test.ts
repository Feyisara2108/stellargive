import { describe, it, expect } from "vitest";
import { renderMarkdown, sanitizeHtml, sanitizeUrl } from "./sanitize";

describe("sanitizeHtml", () => {
  it("removes script tags and keeps text content", () => {
    const malicious = "<script>alert(1)</script>hello";
    expect(sanitizeHtml(malicious)).toBe("hello");
  });

  it("removes script tags inside other elements and filters unallowed tags", () => {
    const malicious = "<div><script>alert(1)</script>hello</div>";
    // Allowed tags: ["p", "br", "strong", "em", "u"]
    expect(sanitizeHtml(malicious)).toBe("hello");
  });

  it("keeps allowed tags", () => {
    const safe = "<p>hello <strong>world</strong></p>";
    expect(sanitizeHtml(safe)).toBe("<p>hello <strong>world</strong></p>");
  });

  it("removes onload and other event handlers", () => {
    const malicious = '<p onload="alert(1)">hello</p>';
    expect(sanitizeHtml(malicious)).toBe("<p>hello</p>");
  });
});

describe("sanitizeUrl", () => {
  it("removes javascript: protocols", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBe("#");
    expect(sanitizeUrl("  JAVASCRIPT:alert(2) ")).toBe("#");
  });

  it("removes data: protocols", () => {
    expect(sanitizeUrl("data:text/html,<script>alert(1)</script>")).toBe("#");
  });

  it("removes vbscript: protocols", () => {
    expect(sanitizeUrl("vbscript:alert(1)")).toBe("#");
  });

  it("keeps safe http: and https: protocols", () => {
    expect(sanitizeUrl("https://example.com")).toBe("https://example.com");
    expect(sanitizeUrl("http://example.com/foo?bar=baz")).toBe("http://example.com/foo?bar=baz");
  });
});

describe("renderMarkdown", () => {
  it("renders bold, italics, links and lists", () => {
    const html = renderMarkdown("**bold** and *italic*\n\n- one\n- two\n\n1. first\n2. second");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<ul><li>one</li><li>two</li></ul>");
    expect(html).toContain("<ol><li>first</li><li>second</li></ol>");
  });

  it("opens external links in a new tab with rel noopener noreferrer", () => {
    const html = renderMarkdown("[Stellar](https://stellar.org)");
    expect(html).toContain('href="https://stellar.org"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("escapes raw HTML so scripts and handlers cannot run", () => {
    const html = renderMarkdown("<script>alert(1)</script><img src=x onerror=alert(1)>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
  });

  it("does not turn javascript: links into anchors", () => {
    const html = renderMarkdown("[x](javascript:alert(1))");
    expect(html).not.toContain("<a");
    expect(html).not.toContain("href");
  });

  it("returns an empty string for empty input", () => {
    expect(renderMarkdown("")).toBe("");
  });
});
