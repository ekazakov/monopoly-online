const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// The game id is the invite: accept a pasted link (`.../games/<uuid>`) or the bare id.
export function gameIdFromInvite(text: string): string | null {
  return text.match(UUID)?.[0].toLowerCase() ?? null;
}
