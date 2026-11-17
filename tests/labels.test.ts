import { describe, it, expect } from 'vitest';

import { fromMacLabel, toMacLabel } from '../src/core/labels';

describe('labels', () => {
  it('maps note labels to Contacts system labels', () => {
    expect(toMacLabel('mobile')).toBe('_$!<Mobile>!$_');
    expect(toMacLabel('Work')).toBe('_$!<Work>!$_');
    expect(toMacLabel('homefax')).toBe('_$!<HomeFAX>!$_');
    expect(toMacLabel('iphone')).toBe('iPhone');
    expect(toMacLabel('')).toBe('_$!<Other>!$_');
  });

  it('keeps custom labels as written', () => {
    expect(toMacLabel('Móvil')).toBe('Móvil');
    expect(toMacLabel('work fax')).toBe('work fax');
  });

  it('round-trips through the form read back from Contacts (hash-stable)', () => {
    for (const l of [
      'home',
      'work',
      'other',
      'mobile',
      'main',
      'homefax',
      'workfax',
      'otherfax',
      'pager',
      'school',
      'iphone',
      'móvil'
    ]) {
      expect(fromMacLabel(toMacLabel(l))).toBe(l);
    }
  });
});
