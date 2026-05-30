import { describe, it, expect } from "vitest";
import { sanitizeHtml, sanitizeUrl } from "./sanitize";

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
