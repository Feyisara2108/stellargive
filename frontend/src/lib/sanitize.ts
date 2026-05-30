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
