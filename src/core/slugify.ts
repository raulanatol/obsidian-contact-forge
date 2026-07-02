// Contact note filenames must be first_name-last_name, lowercase, hyphen-separated,
// with accented/special characters transliterated to plain ASCII.

const COMBINING_DIACRITICS = /[̀-ͯ]/g;

function slugifyPart(value: string): string {
  return value
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Builds the "first-last" slug used as a contact note's base filename. */
export function contactFileSlug(firstName: string, lastName: string): string {
  return [firstName, lastName].map(slugifyPart).filter(Boolean).join('-');
}
