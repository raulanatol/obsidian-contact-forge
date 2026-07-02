// The "To delete in Mac" checklist lives inside the report note itself, not in
// plugin settings: it's rendered by ReportWriter and appended to by
// Actions.markForDeletion. Each line embeds the card id in an HTML comment so
// both sides can find it again without any extra persisted state, and a row
// drops off naturally once the card no longer shows up as orphan-mac (i.e. the
// user actually deleted it in Contacts.app).

import { fullName } from '../core/format';
import type { MacCard } from '../core/types';

export const DELETION_HEADING = '## To delete in Mac';

function cardMarker(cardId: string): string {
  return `<!-- cf-delete:${cardId} -->`;
}

function checklistLine(card: MacCard): string {
  const email = card.emails[0]?.value;
  const label = email ? `${fullName(card)} (${email})` : fullName(card);
  return `- [ ] ${label} — delete manually in Contacts.app ${cardMarker(card.id)}`;
}

const CHECKLIST_LINE_RE = /^- \[.\].*<!-- cf-delete:(\S+) -->\s*$/gm;

/** Checklist lines from a previous report render, keyed by card id, verbatim (preserves check state). */
export function parseExistingChecklist(content: string): Map<string, string> {
  const map = new Map<string, string>();
  let m: RegExpExecArray | null;
  CHECKLIST_LINE_RE.lastIndex = 0;
  while ((m = CHECKLIST_LINE_RE.exec(content))) {
    map.set(m[1], m[0]);
  }
  return map;
}

/** Lines to re-render: only cards the user actually marked AND that are still orphaned. */
export function renderDeletionSection(pendingCardIds: Set<string>, previousLines: Map<string, string>): string[] {
  const lines: string[] = [];
  for (const id of pendingCardIds) {
    const line = previousLines.get(id);
    if (line) lines.push(line);
  }
  return lines;
}

/** Append a new checklist entry for `card`, or no-op if it's already marked. */
export function appendChecklistLine(content: string, card: MacCard): string {
  if (parseExistingChecklist(content).has(card.id)) return content;

  const line = checklistLine(card);
  if (content.includes(DELETION_HEADING)) {
    return content.replace(DELETION_HEADING, `${DELETION_HEADING}\n\n${line}`);
  }
  const sep = content.endsWith('\n') ? '' : '\n';
  return `${content}${sep}\n${DELETION_HEADING}\n\n${line}\n`;
}
