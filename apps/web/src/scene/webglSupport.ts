let cachedSupport: boolean | undefined;

/**
 * Whether this browser can make a WebGL context. Probed once and cached, so each mount does not
 * make a new context. jsdom and old devices say no.
 */
export function hasWebGl(): boolean {
  cachedSupport ??= probeWebGl();
  return cachedSupport;
}

/** Forgets the cached answer, so a test can probe again. */
export function resetWebGlSupportForTests(): void {
  cachedSupport = undefined;
}

function probeWebGl(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!context) return false;
    // Release the probe context at once. Browsers limit live contexts, so a leaked one can
    // evict the board's context.
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}
