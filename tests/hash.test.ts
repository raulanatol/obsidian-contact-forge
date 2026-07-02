import { describe, it, expect } from 'vitest';

import { hashManaged, canonicalize } from '../src/core/hash';
import type { ManagedFields } from '../src/core/types';

const base: ManagedFields = {
  firstName: 'Ana',
  lastName: 'García',
  org: 'Zazume',
  emails: [
    { label: 'work', value: 'ana@zazume.com' },
    { label: 'home', value: 'ana@personal.com' }
  ],
  phones: [{ label: 'mobile', value: '+34600111222' }],
  contactNote: 'Met at PropTech'
};

describe('hashManaged', () => {
  it('is stable across identical content', () => {
    expect(hashManaged(base)).toBe(hashManaged({ ...base }));
  });

  it('is order-independent for emails/phones', () => {
    const reordered: ManagedFields = {
      ...base,
      emails: [base.emails[1], base.emails[0]]
    };
    expect(hashManaged(reordered)).toBe(hashManaged(base));
  });

  it('ignores case and surrounding whitespace in values', () => {
    const messy: ManagedFields = {
      ...base,
      emails: [
        { label: 'WORK', value: ' ANA@zazume.com ' },
        { label: 'home', value: 'ana@personal.com' }
      ]
    };
    expect(hashManaged(messy)).toBe(hashManaged(base));
  });

  it('changes when a managed field changes', () => {
    expect(hashManaged({ ...base, org: 'Other' })).not.toBe(hashManaged(base));
  });

  it('canonicalize drops empty values', () => {
    const c = canonicalize({
      ...base,
      emails: [...base.emails, { label: 'x', value: '  ' }]
    }) as { emails: unknown[] };
    expect(c.emails.length).toBe(2);
  });
});
