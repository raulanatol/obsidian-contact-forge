import { describe, it, expect } from 'vitest';

import type { MacCard } from '../src/core/types';
import { appendChecklistLine, parseExistingChecklist, renderDeletionSection } from '../src/sync/deletionChecklist';

function card(over: Partial<MacCard> = {}): MacCard {
  return {
    id: 'card-1',
    firstName: 'Ana',
    lastName: 'García',
    org: '',
    emails: [{ label: 'work', value: 'ana@zazume.com' }],
    phones: [],
    note: '',
    cfUid: null,
    ...over
  };
}

describe('deletionChecklist', () => {
  it('appends a checklist entry with the card id embedded', () => {
    const content = appendChecklistLine('# Report\n', card());
    expect(content).toContain('## To delete in Mac');
    expect(content).toContain('Ana García (ana@zazume.com)');
    expect(content).toContain('<!-- cf-delete:card-1 -->');
  });

  it('is idempotent: marking the same card twice does not duplicate the line', () => {
    const once = appendChecklistLine('# Report\n', card());
    const twice = appendChecklistLine(once, card());
    expect(twice).toBe(once);
  });

  it('round-trips through parseExistingChecklist', () => {
    const content = appendChecklistLine('# Report\n', card());
    const parsed = parseExistingChecklist(content);
    expect(parsed.size).toBe(1);
    expect(parsed.get('card-1')).toContain('<!-- cf-delete:card-1 -->');
  });

  it('only renders entries the user marked AND that are still pending', () => {
    const content = appendChecklistLine('# Report\n', card({ id: 'card-1' }));
    const previous = parseExistingChecklist(content);

    // card-1 still orphaned -> shows; card-2 was never marked -> does not appear
    // even though it's pending; card-1 resolved (no longer pending) -> disappears.
    expect(renderDeletionSection(new Set(['card-1', 'card-2']), previous)).toEqual([previous.get('card-1')]);
    expect(renderDeletionSection(new Set(['card-2']), previous)).toEqual([]);
  });

  it('preserves the checked state of a previously-rendered line', () => {
    const content = appendChecklistLine('# Report\n', card()).replace('- [ ]', '- [x]');
    const previous = parseExistingChecklist(content);
    const rendered = renderDeletionSection(new Set(['card-1']), previous);
    expect(rendered[0]).toContain('- [x]');
  });
});
