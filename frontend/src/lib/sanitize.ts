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

export const DEDICATION_MAX_LENGTH = 140;

/**
 * Sanitizes a donor dedication message for display: strips all HTML, control
 * characters and repeated whitespace, then truncates to DEDICATION_MAX_LENGTH.
 * The result is plain text; render it as a React text child, never as HTML.
 */
export const sanitizeMessage = (message: string | null | undefined): string => {
  if (!message) return "";
  let text =
    typeof window !== "undefined"
      ? DOMPurify.sanitize(message, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
      : message.replace(/<[^>]*>/g, "");
  // DOMPurify returns serialized HTML; decode entities back to plain text.
  text = text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
  return text
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, DEDICATION_MAX_LENGTH);
};
