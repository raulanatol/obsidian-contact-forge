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
// Diff-based replace: entries whose value is still wanted are kept as-is (label,
// order and any extra metadata survive); only the label is fixed if it changed.
// Unwanted entries are deleted and new values appended. Labels arrive already
// mapped to Contacts' raw form (see src/core/labels.ts#toMacLabel).
function replaceEmails(Contacts, person, list) {
  syncEntries(Contacts, person.emails, list, function (e) {
    return Contacts.Email(e);
  });
}
function replacePhones(Contacts, person, list) {
  syncEntries(Contacts, person.phones, list, function (p) {
    return Contacts.Phone(p);
  });
}
function syncEntries(Contacts, collection, list, make) {
  var wanted = (list || []).slice();
  var toDelete = [];
  collection()
    .slice()
    .forEach(function (entry) {
      var v = norm(entry.value());
      var idx = -1;
      for (var i = 0; i < wanted.length; i++) {
        if (norm(wanted[i].value) === v) {
          idx = i;
          break;
        }
      }
      if (idx === -1) {
        toDelete.push(entry);
        return;
      }
      var w = wanted.splice(idx, 1)[0];
      if (labelName(entry.label()) !== labelName(w.label)) entry.label = w.label;
    });
  toDelete.forEach(function (entry) {
    Contacts.delete(entry);
  });
  wanted.forEach(function (w) {
    collection.push(make({ label: w.label, value: w.value }));
  });
}
function norm(v) {
  return String(v || '')
    .trim()
    .toLowerCase();
}
// Keep in sync with dumpGroup.js and src/core/labels.ts#fromMacLabel.
function labelName(l) {
  if (!l) return 'other';
  return String(l)
    .replace(/^_\$!<|>!\$_$/g, '')
    .toLowerCase();
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
