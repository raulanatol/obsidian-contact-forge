// Mapping between the lowercase labels stored in notes and macOS Contacts labels.
// Pure module. Contacts exposes its built-in labels to AppleScript/JXA in the raw
// CNLabel form (`_$!<Mobile>!$_`); writing the plain word ("mobile") instead creates
// a *custom* label, which shows up untranslated and outside the standard picker.

const SYSTEM_LABELS: Record<string, string> = {
  home: '_$!<Home>!$_',
  work: '_$!<Work>!$_',
  other: '_$!<Other>!$_',
  mobile: '_$!<Mobile>!$_',
  main: '_$!<Main>!$_',
  homefax: '_$!<HomeFAX>!$_',
  workfax: '_$!<WorkFAX>!$_',
  otherfax: '_$!<OtherFAX>!$_',
  pager: '_$!<Pager>!$_',
  school: '_$!<School>!$_',
  iphone: 'iPhone'
};

/** Raw Contacts label → the lowercase form used in notes and hashing. */
export function fromMacLabel(raw: string | null | undefined): string {
  if (!raw) return 'other';
  return String(raw)
    .replace(/^_\$!<|>!\$_$/g, '')
    .toLowerCase();
}

/** Note label → the label to write into Contacts (system label when one exists). */
export function toMacLabel(label: string | null | undefined): string {
  const l = (label ?? '').trim();
  if (!l) return SYSTEM_LABELS.other;
  return SYSTEM_LABELS[l.toLowerCase()] ?? l;
}
