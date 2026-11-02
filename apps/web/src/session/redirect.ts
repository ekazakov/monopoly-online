// The `redirect` search param of /sign-in is user input. Only a path on this site may pass:
// one leading "/", no "//" or "/\" (browsers read both as another host), no control characters.
export function safeRedirect(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith("/")) return undefined;
  if (value.startsWith("//") || value.includes("\\")) return undefined;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return undefined;
  let url: URL;
  try {
    url = new URL(value, "http://local.invalid");
  } catch {
    return undefined;
  }
  if (url.origin !== "http://local.invalid") return undefined;
  // Back to the sign-in screen would only loop.
  if (url.pathname === "/sign-in") return undefined;
  return value;
}
