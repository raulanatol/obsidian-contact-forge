// Decision logic for auto-sync (push one note on edit). PURE module: no Obsidian,
// no Node, no I/O. The heavy lifting is delegated to reconcile() so a single-note
// push follows exactly the same rules as a manual sync.

import { hashManaged } from '../core/hash';
import type { ContactNote, MacCard, ManagedFields } from '../core/types';

import { reconcile } from './Reconciler';

/**
 * A brand-new note (no linked card) is only auto-created in Contacts once it has a
 * name and at least one email or phone, so a half-filled template never spawns an
 * empty card.
 */
export function isPushable(m: ManagedFields): boolean {
  const hasName = m.firstName.trim() !== '' || m.lastName.trim() !== '';
  const hasValue = (list: { value: string }[]) => list.some(lv => lv.value.trim() !== '');
  return hasName && (hasValue(m.emails) || hasValue(m.phones));
}

export type Preflight =
  | { action: 'skip'; reason: 'opted-out' | 'unchanged' | 'incomplete' }
  | { action: 'fetch-card'; cardId: string }
  | { action: 'evaluate-create' };

/**
 * Cheap, local-only gate run before any osascript call. Edits to the note body, or
 * our own sync-state writes, leave the managed hash untouched and stop here.
 */
export function preflight(note: ContactNote): Preflight {
  if (!note.syncEnabled) return { action: 'skip', reason: 'opted-out' };
  if (note.macContactId) {
    if (note.managedHash === hashManaged(note.managed)) return { action: 'skip', reason: 'unchanged' };
    return { action: 'fetch-card', cardId: note.macContactId };
  }
  if (!isPushable(note.managed)) return { action: 'skip', reason: 'incomplete' };
  return { action: 'evaluate-create' };
}

export type Decision =
  | { action: 'push'; cardId: string | null }
  | { action: 'skip' }
  | { action: 'conflict'; card: MacCard }
  | { action: 'error'; message: string };

/**
 * @param note    the edited note
 * @param related other notes that could collide with it (same obsidian_uid, same
 *                mac_contact_id, or owning the card's cf-uid marker)
 * @param card    the note's linked card, freshly read, or null
 */
export function decide(note: ContactNote, related: ContactNote[], card: MacCard | null): Decision {
  const plan = reconcile({ notes: [note, ...related], cards: card ? [card] : [] });
  const bucket = plan.buckets.find(b => 'note' in b && b.note === note);
  switch (bucket?.kind) {
    case 'dirty':
      return { action: 'push', cardId: bucket.card?.id ?? null };
    case 'edited-in-mac':
      return { action: 'conflict', card: bucket.card };
    case 'error':
      return { action: 'error', message: bucket.message };
    default:
      return { action: 'skip' };
  }
}
