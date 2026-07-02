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
    // stale hash simulates previous sync state
    changed.managedHash = '00000000';
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
});
