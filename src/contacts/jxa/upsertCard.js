// JXA: create or update a person, writing ONLY managed fields, preserving photo/groups.
// Input: JSON {id|null, managed:{firstName,lastName,org,emails,phones,contactNote},
//              group, noteBlock}
// Output: JSON {"id": "<person id>"}
function run(argv) {
  var input = JSON.parse(argv[0] || '{}');
  var Contacts = Application('Contacts');
  var person;
  if (input.id) {
    var found = Contacts.people.whose({ id: input.id });
    person = found.length ? found[0] : null;
  }
  if (!person) {
    // Set name/org in the constructor: properties assigned after push+save on a
    // freshly created person are silently dropped (stale specifier post-commit).
    person = Contacts.Person({
      firstName: input.managed.firstName,
      lastName: input.managed.lastName,
      organization: input.managed.org
    });
    Contacts.people.push(person);
    Contacts.save();
  } else {
    person.firstName = input.managed.firstName;
    person.lastName = input.managed.lastName;
    person.organization = input.managed.org;
  }

  replaceEmails(Contacts, person, input.managed.emails);
  replacePhones(Contacts, person, input.managed.phones);

  var base = (input.managed.contactNote || '').trim();
  person.note = base + (base ? '\n\n' : '') + input.noteBlock;

  ensureInGroup(Contacts, person, input.group);

  Contacts.save();
  return JSON.stringify({ id: person.id() });
}
function replaceEmails(Contacts, person, list) {
  person
    .emails()
    .slice()
    .forEach(function (e) {
      Contacts.delete(e);
    });
  (list || []).forEach(function (e) {
    person.emails.push(Contacts.Email({ label: e.label, value: e.value }));
  });
}
function replacePhones(Contacts, person, list) {
  person
    .phones()
    .slice()
    .forEach(function (p) {
      Contacts.delete(p);
    });
  (list || []).forEach(function (p) {
    person.phones.push(Contacts.Phone({ label: p.label, value: p.value }));
  });
}
function ensureInGroup(Contacts, person, groupName) {
  if (!groupName) return; // syncAllContacts mode: no group to join.
  // Pushing an already-committed person into groups[0].people re-triggers a
  // "make new" event and blanks the record. Use the "add ... to ..." command
  // (JXA idiom: app.add(obj, {to: dest})) to add an existing person to a group.
  var groups = Contacts.groups.whose({ name: groupName });
  if (groups.length) {
    Contacts.add(person, { to: groups[0] });
  }
}
