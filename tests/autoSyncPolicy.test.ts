import { describe, it, expect } from 'vitest';

import { hashManaged } from '../src/core/hash';
import type { ContactNote, MacCard, ManagedFields } from '../src/core/types';
import { decide, isPushable, preflight } from '../src/sync/autoSyncPolicy';

function managed(over: Partial<ManagedFields> = {}): ManagedFields {
  return {
    firstName: 'Ana',
    lastName: 'Ruiz',
    org: '',
    emails: [{ label: 'work', value: 'ana@example.com' }],
    phones: [],
    contactNote: '',
    ...over
  };
}

function note(over: Partial<ContactNote> = {}): ContactNote {
  const m = over.managed ?? managed();
  return {
    path: 'Contacts/ana.md',
    obsidianUid: '0a1b2c3d-0000-4000-8000-000000000001',
    macContactId: 'card-ana',
    managedHash: hashManaged(m),
    syncedAt: null,
    syncEnabled: true,
    ...over,
    managed: m
  };
}

function card(over: Partial<MacCard> = {}): MacCard {
  const m = managed();
  return {
    id: 'card-ana',
    ...m,
    note: 'cf-uid: 0a1b2c3d-0000-4000-8000-000000000001',
    cfUid: '0a1b2c3d-0000-4000-8000-000000000001',
    ...over
  };
}

describe('isPushable', () => {
  it('requires a name and an email or phone', () => {
    expect(isPushable(managed())).toBe(true);
    expect(isPushable(managed({ emails: [], phones: [{ label: 'mobile', value: '600' }] }))).toBe(true);
    expect(isPushable(managed({ firstName: '', lastName: '' }))).toBe(false);
    expect(isPushable(managed({ emails: [] }))).toBe(false);
    expect(isPushable(managed({ emails: [{ label: 'work', value: '  ' }] }))).toBe(false);
  });
});

describe('preflight', () => {
  it('skips opted-out notes', () => {
    expect(preflight(note({ syncEnabled: false }))).toEqual({ action: 'skip', reason: 'opted-out' });
  });

  it('skips unchanged linked notes without touching Contacts (no feedback loop)', () => {
    expect(preflight(note())).toEqual({ action: 'skip', reason: 'unchanged' });
  });

  it('fetches the linked card when managed fields changed', () => {
    const n = note({ managed: managed({ org: 'New' }), managedHash: hashManaged(managed()) });
    expect(preflight(n)).toEqual({ action: 'fetch-card', cardId: 'card-ana' });
  });

  it('does not create a card for an incomplete new note', () => {
    const n = note({ macContactId: null, managedHash: null, managed: managed({ emails: [] }) });
    expect(preflight(n)).toEqual({ action: 'skip', reason: 'incomplete' });
  });

  it('evaluates creation for a complete new note', () => {
    expect(preflight(note({ macContactId: null, managedHash: null }))).toEqual({ action: 'evaluate-create' });
  });
});

describe('decide', () => {
  const edited = () => note({ managed: managed({ org: 'New' }), managedHash: hashManaged(managed()) });

  it('pushes an edited note whose card still matches the last write', () => {
    expect(decide(edited(), [], card())).toEqual({ action: 'push', cardId: 'card-ana' });
  });

  it('creates when the note has no card yet', () => {
    const n = note({ macContactId: null, managedHash: null });
    expect(decide(n, [], null)).toEqual({ action: 'push', cardId: null });
  });

  it('reports a conflict when the card was also edited in Mac', () => {
    const d = decide(edited(), [], card({ org: 'EditedOnIphone' }));
    expect(d.action).toBe('conflict');
  });

  it('errors (never creates) when the linked card is gone', () => {
    expect(decide(edited(), [], null).action).toBe('error');
  });

  it('errors on a duplicated note (same obsidian_uid)', () => {
    const copy = { ...edited(), path: 'Contacts/ana-2.md' };
    expect(decide(edited(), [copy], card()).action).toBe('error');
  });

  it('refuses to overwrite an existing card on first link without a matching marker', () => {
    const n = note({ managedHash: null, managed: managed({ org: 'New' }) });
    expect(decide(n, [], card({ cfUid: null, note: '' })).action).toBe('error');
  });

  it('still heals a half-finished adopt when the card carries this note’s marker', () => {
    const n = note({ managedHash: null });
    expect(decide(n, [], card())).toEqual({ action: 'push', cardId: 'card-ana' });
  });
});
