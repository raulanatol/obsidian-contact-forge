// JXA: dump managed fields of every person in a named group.
// Input (argv[0] after script): JSON {"group":"Obsidian"}
// Output: JSON array of cards on stdout.
function run(argv) {
  ObjC.import('stdlib');
  var input = JSON.parse(argv[0] || '{}');
  var Contacts = Application('Contacts');
  var groups = Contacts.groups.whose({ name: input.group });
  if (groups.length === 0) {
    throw new Error('group-not-found:' + input.group);
  }
  var people = groups[0].people();
  var out = [];
  for (var i = 0; i < people.length; i++) {
    var p = people[i];
    var emails = p.emails().map(function (e) {
      return { label: labelName(e.label()), value: e.value() };
    });
    var phones = p.phones().map(function (ph) {
      return { label: labelName(ph.label()), value: ph.value() };
    });
    var note = p.note() || '';
    var m = note.match(/cf-uid:\s*([0-9a-fA-F-]{8,})/);
    out.push({
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
  return JSON.stringify(out);
}
function labelName(l) {
  if (!l) return 'other';
  return String(l)
    .replace(/^_\$!<|>!\$_$/g, '')
    .toLowerCase();
}
