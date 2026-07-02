import { describe, it, expect } from 'vitest';

import { contactFileSlug } from '../src/core/slugify';

describe('contactFileSlug', () => {
  it('lowercases and hyphenates first and last name', () => {
    expect(contactFileSlug('Ana', 'García')).toBe('ana-garcia');
  });

  it('transliterates accented and special characters to plain ASCII', () => {
    expect(contactFileSlug('François', 'Müller')).toBe('francois-muller');
  });

  it('collapses internal whitespace and punctuation into a single hyphen', () => {
    expect(contactFileSlug('Jean Paul', "O'Brien")).toBe('jean-paul-o-brien');
  });

  it('drops an empty name part instead of leaving a stray hyphen', () => {
    expect(contactFileSlug('Ana', '')).toBe('ana');
    expect(contactFileSlug('', 'García')).toBe('garcia');
  });

  it('returns an empty string when both names are empty', () => {
    expect(contactFileSlug('', '')).toBe('');
  });
});
