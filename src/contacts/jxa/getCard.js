// JXA: read a single person by Contacts id (used by auto-sync so a single edit
// doesn't have to dump the whole address book).
// Input: JSON {"id": "<person id>"}
// Output: JSON card (same shape as dumpGroup entries), or JSON null if not found.
function run(argv) {
  var input = JSON.parse(argv[0] || '{}');
  var Contacts = Application('Contacts');
  var found = Contacts.people.whose({ id: input.id });
  if (!found.length) return JSON.stringify(null);
  var p = found[0];
  var emails = p.emails().map(function (e) {
    return { label: labelName(e.label()), value: e.value() };
  });
  var phones = p.phones().map(function (ph) {
    return { label: labelName(ph.label()), value: ph.value() };
  });
  var note = p.note() || '';
  var m = note.match(/cf-uid:\s*([0-9a-fA-F-]{8,})/);
  return JSON.stringify({
    id: p.id(),
    firstName: p.firstName() || '',
    lastName: p.lastName() || '',
    org: p.organization() || '',
    emails: emails,
    phones: phones,
    note: note,
    cfUid: m ? m[1] : null
  });
}
// Keep in sync with dumpGroup.js and src/core/labels.ts#fromMacLabel.
function labelName(l) {
  if (!l) return 'other';
  return String(l)
    .replace(/^_\$!<|>!\$_$/g, '')
    .toLowerCase();
}
