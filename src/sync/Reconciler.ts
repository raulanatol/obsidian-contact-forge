// The reconciliation engine — the core of Contact Forge.
// PURE module: no Obsidian, no Node, no I/O. Fully unit-testable with fixtures.
//
// Given the set of contact notes (source of truth) and the set of Mac cards in the
// configured source group, it matches them, buckets each into a SyncStatus, and
// produces a SyncPlan describing intended writes. It NEVER performs writes.

import { hashManaged } from '../core/hash';
import type { Bucket, ContactNote, MacCard, ManagedFields, SyncPlan } from '../core/types';
import { stripMarkerBlock } from '../core/uid';

function normName(s: string): string {
  return s.trim().toLowerCase();
}

function cardManaged(card: MacCard): ManagedFields {
  return {
    firstName: card.firstName,
    lastName: card.lastName,
    org: card.org,
    emails: card.emails,
    phones: card.phones,
    // The card note carries our marker block; the actual contactNote content is
    // everything above the marker. The bridge is responsible for splitting; here
    // we compare only what we control, so we treat the stored note as-is minus marker.
    contactNote: stripMarkerBlock(card.note)
  };
}

function emailsOf(m: ManagedFields): Set<string> {
  return new Set(m.emails.map(e => e.value.trim().toLowerCase()));
}

function shareEmail(a: ManagedFields, b: ManagedFields): boolean {
  const ea = emailsOf(a);
  for (const e of emailsOf(b)) if (ea.has(e)) return true;
  return false;
}

export interface ReconcileInput {
  notes: ContactNote[];
  cards: MacCard[];
}

export function reconcile(input: ReconcileInput): SyncPlan {
  const { notes, cards } = input;

  const cardsById = new Map<string, MacCard>();
  const cardsByUid = new Map<string, MacCard>();
  for (const c of cards) {
    cardsById.set(c.id, c);
    if (c.cfUid) cardsByUid.set(c.cfUid, c);
  }

  const matchedCardIds = new Set<string>();
  const buckets: Bucket[] = [];
  const toCreate: ContactNote[] = [];
  const toUpdate: { note: ContactNote; card: MacCard }[] = [];

  // Two notes claiming the same obsidian_uid (e.g. a duplicated file) would both
  // match — and alternately overwrite — the same card. Refuse to sync any of them.
  const uidCount = new Map<string, number>();
  for (const n of notes) uidCount.set(n.obsidianUid, (uidCount.get(n.obsidianUid) ?? 0) + 1);

  const strongMatch = (note: ContactNote): MacCard | null =>
    // 1) strong match by cf-uid marker, 2) fallback: cached mac_contact_id
    cardsByUid.get(note.obsidianUid) ?? (note.macContactId ? (cardsById.get(note.macContactId) ?? null) : null);

  // Opted-out notes still own their card: claim it first so it is never offered
  // as an orphan (adopting it would create a second note for the same person).
  for (const note of notes) {
    if (note.syncEnabled) continue;
    const card = strongMatch(note);
    if (card) matchedCardIds.add(card.id);
  }

  for (const note of notes) {
    if (!note.syncEnabled) continue; // per-note opt-out

    if ((uidCount.get(note.obsidianUid) ?? 0) > 1) {
      const card = strongMatch(note);
      if (card) matchedCardIds.add(card.id);
      buckets.push({
        kind: 'error',
        note,
        message: `Duplicate obsidian_uid ${note.obsidianUid} shared by several notes — give each note its own UID.`
      });
      continue;
    }

    const card = strongMatch(note);
    if (card && matchedCardIds.has(card.id)) {
      buckets.push({
        kind: 'error',
        note,
        card,
        message: `Card ${card.id} is already linked to another note.`
      });
      continue;
    }

    // 3) weak heuristic: name + shared email (suggestion only)
    if (!card) {
      const cand = cards.find(
        c =>
          !matchedCardIds.has(c.id) &&
          c.cfUid == null &&
          normName(`${c.firstName} ${c.lastName}`) === normName(`${note.managed.firstName} ${note.managed.lastName}`) &&
          shareEmail(cardManaged(c), note.managed)
      );
      if (cand) {
        matchedCardIds.add(cand.id);
        buckets.push({ kind: 'suggestion', note, card: cand });
        continue;
      }
    }

    if (!card) {
      if (note.macContactId) {
        // The note was linked to a card we can no longer see (deleted in Mac,
        // removed from the source group, or the dump is incomplete). Creating a
        // fresh card here is how duplicates happen — surface it instead.
        buckets.push({
          kind: 'error',
          note,
          message:
            `Linked Mac card ${note.macContactId} was not found. If it was deleted on purpose, ` +
            'clear mac_contact_id in the note to recreate it.'
        });
        continue;
      }
      // note only -> create
      toCreate.push(note);
      buckets.push({ kind: 'dirty', note, card: null });
      continue;
    }

    matchedCardIds.add(card.id);

    const currentHash = hashManaged(note.managed);
    const noteChanged = currentHash !== note.managedHash;
    const cardHash = hashManaged(cardManaged(card));
    const cardMatchesLastWrite = note.managedHash === cardHash;

    if (!noteChanged && cardMatchesLastWrite) {
      buckets.push({ kind: 'in-sync', note, card });
    } else if (noteChanged && (cardMatchesLastWrite || note.managedHash === null)) {
      // Obsidian is source of truth and the card still holds what we last wrote
      // (or we never wrote it): safe to push.
      toUpdate.push({ note, card });
      buckets.push({ kind: 'dirty', note, card });
    } else {
      // Card diverged from the last write (edited in Mac / iPhone). Even if the
      // note changed too, never overwrite silently: the user decides via the
      // report's overwrite/pull actions.
      buckets.push({ kind: 'edited-in-mac', note, card });
    }
  }

  // any card in the source group not matched to a note -> orphan
  for (const c of cards) {
    if (!matchedCardIds.has(c.id)) {
      buckets.push({ kind: 'orphan-mac', card: c });
    }
  }

  const counts: Record<string, number> = {};
  for (const b of buckets) counts[b.kind] = (counts[b.kind] ?? 0) + 1;

  return { buckets, toCreate, toUpdate, counts };
}
