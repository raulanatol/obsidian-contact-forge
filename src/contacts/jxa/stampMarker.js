// JXA: idempotently ensure the cf-uid marker + deep link exist in a person's note.
// Input: JSON {id, uid, noteBlock}
// Output: JSON {"ok": true}
function run(argv) {
  var input = JSON.parse(argv[0] || '{}');
  var Contacts = Application('Contacts');
  var found = Contacts.people.whose({ id: input.id });
  if (!found.length) {
    throw new Error('person-not-found:' + input.id);
  }
  var person = found[0];
  var note = person.note() || '';
  note = note
    .replace(/^obsidian:\/\/search\?[^\n]*$/m, '')
    .replace(/^cf-uid:\s*[0-9a-fA-F-]{8,}\s*$/m, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  person.note = note + (note ? '\n\n' : '') + input.noteBlock;
  Contacts.save();
  return JSON.stringify({ ok: true });
}
