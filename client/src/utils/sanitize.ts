// SEC-08: Shared sanitization utilities used by MeetMap and VenuePicker.

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** Returns color if it is a valid 6-digit hex, otherwise falls back to a neutral grey. */
export function safeHexColor(color: string, fallback = '#888888'): string {
  return HEX_COLOR_RE.test(color) ? color : fallback;
}

/** Escape HTML special characters to prevent XSS in injected HTML strings. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
