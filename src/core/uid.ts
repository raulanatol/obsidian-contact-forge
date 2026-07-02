// UUID generation, deep links, and the machine marker written into Mac cards.
// Pure except for crypto.randomUUID (available in Obsidian's Electron runtime).

export function newUuid(): string {
  // crypto.randomUUID is available in modern Electron; fall back if absent.
  const c = (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  // RFC4122-ish fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** obsidian:// deep link that opens the source note by UID search. */
export function deepLink(vaultName: string, uid: string): string {
  const v = encodeURIComponent(vaultName);
  // Uses Obsidian's advanced-uri-style search on frontmatter; if that plugin is
  // absent, the human can still copy the UID. Kept simple and dependency-free.
  const query = encodeURIComponent(`obsidian_uid: ${uid}`);
  return `obsidian://search?vault=${v}&query=${query}`;
}

/** Machine-readable marker line embedded in the Mac card note field. */
export function markerLine(uid: string): string {
  return `cf-uid: ${uid}`;
}

/** Extract a cf-uid marker from a Mac card note field, if present. */
export function parseMarker(note: string): string | null {
  const m = note.match(/^cf-uid:\s*([0-9a-fA-F-]{8,})\s*$/m);
  return m ? m[1] : null;
}

/** Build the block appended to a Mac card note (deep link + marker). */
export function macNoteBlock(vaultName: string, uid: string): string {
  return `${deepLink(vaultName, uid)}\n${markerLine(uid)}`;
}

/** Strip the deep-link + cf-uid marker lines back out of a Mac card's note field. */
export function stripMarkerBlock(note: string): string {
  return note
    .replace(/^obsidian:\/\/search\?[^\n]*$/m, "")
    .replace(/^cf-uid:\s*[0-9a-fA-F-]{8,}\s*$/m, "")
    .trim();
}
