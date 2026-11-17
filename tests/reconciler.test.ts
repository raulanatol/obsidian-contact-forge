import { describe, it, expect } from 'vitest';

import { hashManaged } from '../src/core/hash';
import type { ContactNote, MacCard, ManagedFields } from '../src/core/types';
import { reconcile } from '../src/sync/Reconciler';

function managed(over: Partial<ManagedFields> = {}): ManagedFields {
  return {
    firstName: 'John',
    lastName: 'García',
    org: 'Acme Inc',
    emails: [{ label: 'work', value: 'john@example.com' }],
    phones: [{ label: 'mobile', value: '+34600111222' }],
    contactNote: '',
    ...over
  };
}

function note(over: Partial<ContactNote> = {}): ContactNote {
  const m = over.managed ?? managed();
  return {
    path: 'Contacts/John.md',
    obsidianUid: 'uid-john',
    macContactId: null,
    managed: m,
    managedHash: hashManaged(m),
    syncedAt: null,
    syncEnabled: true,
    ...over,
    managed: m
  };
}

function card(over: Partial<MacCard> = {}): MacCard {
  return {
    id: 'card-1',
    firstName: 'John',
    lastName: 'García',
    org: 'Acme Inc',
    emails: [{ label: 'work', value: 'john@example.com' }],
    phones: [{ label: 'mobile', value: '+34600111222' }],
    note: '',
    cfUid: null,
    ...over
  };
}

describe('reconcile', () => {
  it('marks unchanged matched pair as in-sync (idempotent, no writes)', () => {
    const c = card({ cfUid: 'uid-john' });
    const plan = reconcile({ notes: [note()], cards: [c] });
    expect(plan.counts['in-sync']).toBe(1);
    expect(plan.toCreate).toHaveLength(0);
    expect(plan.toUpdate).toHaveLength(0);
  });

  it('running twice with no edits still yields zero writes', () => {
    const c = card({ cfUid: 'uid-john' });
    const first = reconcile({ notes: [note()], cards: [c] });
    const second = reconcile({ notes: [note()], cards: [c] });
    expect(first.toUpdate.length + first.toCreate.length).toBe(0);
    expect(second.toUpdate.length + second.toCreate.length).toBe(0);
  });

  it('note-only becomes a create', () => {
    const plan = reconcile({ notes: [note()], cards: [] });
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.counts['dirty']).toBe(1);
  });

  it('edited note becomes dirty->update', () => {
    const changed = note({ managed: managed({ org: 'NewOrg' }) });
    // hash of the previous sync (what the card still holds)
    changed.managedHash = hashManaged(managed());
    const c = card({ cfUid: 'uid-john' });
    const plan = reconcile({ notes: [changed], cards: [c] });
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.counts['dirty']).toBe(1);
  });

  it('card diverged but note unchanged -> edited-in-mac', () => {
    const c = card({ cfUid: 'uid-john', org: 'ChangedInMac' });
    const plan = reconcile({ notes: [note()], cards: [c] });
    expect(plan.counts['edited-in-mac']).toBe(1);
    expect(plan.toUpdate).toHaveLength(0);
  });

  it('unmatched card in group -> orphan-mac', () => {
    const orphan = card({ id: 'card-x', firstName: 'Zoe', cfUid: null, emails: [] });
    const plan = reconcile({ notes: [note()], cards: [card({ cfUid: 'uid-john' }), orphan] });
    expect(plan.counts['orphan-mac']).toBe(1);
  });

  it('matches by cached mac_contact_id when no marker', () => {
    const n = note({ macContactId: 'card-1' });
    const plan = reconcile({ notes: [n], cards: [card()] });
    expect(plan.counts['in-sync']).toBe(1);
  });

  it('weak name+email match surfaces as suggestion, never auto-write', () => {
    const n = note({ obsidianUid: 'uid-john', macContactId: null });
    const c = card({ id: 'card-9', cfUid: null }); // same name+email, no ids linked
    const plan = reconcile({ notes: [n], cards: [c] });
    expect(plan.counts['suggestion']).toBe(1);
    expect(plan.toUpdate).toHaveLength(0);
    expect(plan.toCreate).toHaveLength(0);
  });

  it('respects per-note opt-out', () => {
    const n = note({ syncEnabled: false });
    const plan = reconcile({ notes: [n], cards: [] });
    expect(plan.toCreate).toHaveLength(0);
  });

  it('opted-out note still claims its card so it is not offered as an orphan', () => {
    const n = note({ syncEnabled: false });
    const plan = reconcile({ notes: [n], cards: [card({ cfUid: 'uid-john' })] });
    expect(plan.counts['orphan-mac']).toBeUndefined();
    expect(plan.toUpdate).toHaveLength(0);
  });

  it('note linked to a missing card is an error, never a create (no duplicates)', () => {
    const n = note({ macContactId: 'card-gone' });
    const plan = reconcile({ notes: [n], cards: [] });
    expect(plan.toCreate).toHaveLength(0);
    expect(plan.counts['error']).toBe(1);
  });

  it('empty card dump with previously synced notes creates nothing', () => {
    const notes = [
      note({ obsidianUid: 'a', macContactId: 'card-a', path: 'a.md' }),
      note({ obsidianUid: 'b', macContactId: 'card-b', path: 'b.md' })
    ];
    const plan = reconcile({ notes, cards: [] });
    expect(plan.toCreate).toHaveLength(0);
    expect(plan.toUpdate).toHaveLength(0);
  });

  it('duplicate obsidian_uid across notes is an error and writes nothing', () => {
    const a = note({ path: 'a.md', managed: managed({ org: 'A' }), managedHash: hashManaged(managed()) });
    const b = note({ path: 'b.md', managed: managed({ org: 'B' }), managedHash: hashManaged(managed()) });
    const plan = reconcile({ notes: [a, b], cards: [card({ cfUid: 'uid-john' })] });
    expect(plan.toUpdate).toHaveLength(0);
    expect(plan.counts['error']).toBe(2);
    expect(plan.counts['orphan-mac']).toBeUndefined();
  });

  it('a card claimed by marker cannot be claimed again by another note via cached id', () => {
    const a = note({ path: 'a.md', obsidianUid: 'uid-john' });
    const b = note({ path: 'b.md', obsidianUid: 'uid-other', macContactId: 'card-1' });
    const plan = reconcile({ notes: [a, b], cards: [card({ cfUid: 'uid-john' })] });
    expect(plan.counts['in-sync']).toBe(1);
    expect(plan.counts['error']).toBe(1);
    expect(plan.toUpdate).toHaveLength(0);
  });

  it('note and card both changed -> edited-in-mac, never a silent overwrite', () => {
    const n = note({ managed: managed({ org: 'NewInObsidian' }), managedHash: hashManaged(managed()) });
    const c = card({ cfUid: 'uid-john', org: 'NewInMac' });
    const plan = reconcile({ notes: [n], cards: [c] });
    expect(plan.counts['edited-in-mac']).toBe(1);
    expect(plan.toUpdate).toHaveLength(0);
  });

  it('linked note with no recorded hash (half-finished adopt) is pushed to heal it', () => {
    const n = note({ macContactId: 'card-1', managedHash: null });
    const plan = reconcile({ notes: [n], cards: [card()] });
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toCreate).toHaveLength(0);
  });
});

describe('reconcile — marker precedence', () => {
  it('cf-uid marker wins over another note’s cached id, regardless of order', () => {
    const owner = note({ path: 'owner.md', obsidianUid: 'uid-john' });
    const stale = note({
      path: 'stale.md',
      obsidianUid: 'uid-stale',
      macContactId: 'card-1',
      managed: managed({ org: 'Changed' }),
      managedHash: '00000000'
    });
    const c = card({ cfUid: 'uid-john' });
    for (const notes of [
      [stale, owner],
      [owner, stale]
    ]) {
      const plan = reconcile({ notes, cards: [c] });
      expect(plan.toUpdate).toHaveLength(0);
      expect(plan.counts['in-sync']).toBe(1);
      expect(plan.counts['error']).toBe(1);
    }
  });
});
