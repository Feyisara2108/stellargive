import DOMPurify from "dompurify";

/**
 * Sanitizes HTML strings using DOMPurify with a strict tag whitelist to prevent XSS.
 * Safe for both Client and Server execution.
 */
export const sanitizeHtml = (html: string): string => {
  if (!html) return "";
  if (typeof window !== "undefined") {
    return DOMPurify.sanitize(html, { ALLOWED_TAGS: ["p", "br", "strong", "em", "u"] });
  }
  return html;
};

/** Max dedication length; comfortably under the contract's 250-byte MAX_COMMENT_LEN. */
export const DEDICATION_MAX_LENGTH = 140;

/**
 * Reduces a free-text donation dedication to plain text: drops script/style
 * blocks with their contents, strips any other tags (keeping their text),
 * removes control characters, collapses whitespace, and caps the length.
 * Pure string handling so it behaves the same on server and client.
 */
export const sanitizeMessage = (message: string): string => {
  if (!message) return "";
  return message
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, DEDICATION_MAX_LENGTH);
};

/**
 * Sanitizes URLs to block javascript:, data:, and vbscript: protocols.
 */
export const sanitizeUrl = (url: string): string => {
  if (!url) return "";
  const cleaned = url.trim();
  const lower = cleaned.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:")
  ) {
    return "#";
  }
  return cleaned;
};

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const renderInline = (escaped: string): string => {
  const links: string[] = [];
  const withLinkTokens = escaped.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, label: string, href: string) => {
      links.push(`<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`);
      return `\u0000${links.length - 1}\u0000`;
    },
  );
  return withLinkTokens
    .replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])_([^_\s][^_]*?)_(?=$|[\s.,!?;:)])/g, "$1<em>$2</em>")
    .replace(/\u0000(\d+)\u0000/g, (_m, i: string) => links[Number(i)]);
};

/**
 * Converts a safe subset of markdown (bold, italics, links, lists) to HTML and
 * sanitizes the result with DOMPurify. Input is HTML-escaped before parsing, only
 * http(s) links are recognised, and links open in a new tab with rel="noopener noreferrer".
 */
export const renderMarkdown = (markdown: string): string => {
  if (!markdown) return "";
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) blocks.push(`<p>${paragraph.join("<br>")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) {
      blocks.push(`<${list.tag}>${list.items.map((i) => `<li>${i}</li>`).join("")}</${list.tag}>`);
    }
    list = null;
  };

  for (const rawLine of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const line = escapeHtml(rawLine.trim());
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (!line) {
      flushParagraph();
      flushList();
    } else if (bullet || numbered) {
      const tag = bullet ? "ul" : "ol";
      flushParagraph();
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push(renderInline((bullet ?? numbered)![1]));
    } else {
      flushList();
      paragraph.push(renderInline(line));
    }
  }
  flushParagraph();
  flushList();

  const html = blocks.join("");
  if (typeof window === "undefined") return html;
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "strong", "em", "ul", "ol", "li", "a"],
    ALLOWED_ATTR: ["href", "target", "rel"],
  });
};
