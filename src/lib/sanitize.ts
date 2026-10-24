// ============================================================================
// RMIS — HTML sanitizer (spec §12.4). Regex DENYLIST: strips scripts/iframes,
// on* handlers, javascript:/data: URLs, data-*/style attributes; forces links
// to target=_blank rel=noopener noreferrer. Applied to admin-authored rich
// text.
// ============================================================================

export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return "";
  let html = String(input);

  // Remove dangerous tag blocks entirely (with content for script/style/iframe).
  html = html.replace(/<\s*\/?\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  html = html.replace(/<\s*\/?\s*(script|style|iframe|object|embed|form|input|textarea|select|button|link|meta|base|svg|math)[^>]*\/?>/gi, "");

  // Strip event handlers.
  html = html.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  // Neutralize javascript:/data: URLs.
  html = html.replace(/(href|src)\s*=\s*("\s*(javascript|data):[^"]*"|'\s*(javascript|data):[^']*'|(javascript|data):[^\s>]*)/gi, '$1="#"');

  // Strip data-* and style attributes.
  html = html.replace(/\sdata-[\w-]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  html = html.replace(/\sstyle\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  // Force anchor safety.
  html = html.replace(/<a\s/gi, '<a target="_blank" rel="noopener noreferrer" ');
  html = html.replace(/<a\s+target="_blank" rel="noopener noreferrer" ([^>]*?)target="[^"]*"/gi, '<a $1');
  html = html.replace(/<a\s+target="_blank" rel="noopener noreferrer" ([^>]*?)rel="[^"]*"/gi, '<a $1 rel="noopener noreferrer"');

  return html.trim();
}

export function textToHtml(text: string | null | undefined): string {
  if (!text) return "";
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`).join("");
}

/** Task 26 — rich-editor companion: reduce editor HTML to the plain text the
 *  card snippets / plain columns carry (block tags become line breaks, list
 *  items become "- " bullets). Client-safe, no DOM required. */
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<\s*(br|\/p|\/div|\/h[1-6]|\/li|\/ul|\/ol)[^>]*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
