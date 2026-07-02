# Manual test checklist (JXA paths)

Unit tests cover hashing and reconciliation. The osascript paths need a real Mac.

**Status: validated on macOS, 2026-07-02 — all 9 scenarios pass.**

1. [x] **Access** — deny automation permission, run sync → guidance Notice appears.
   Grant it, run **Test Contacts access** → "Contacts access OK".
2. [x] **Create** — new CN with name/email/phone, sync → card appears in the group,
   note field contains the `cf-uid:` marker + deep link.
3. [x] **Idempotency** — sync again with no edits → report shows only in-sync, no writes.
4. [x] **Update** — edit the CN's org, sync → card org updates; photo unchanged.
5. [x] **Photo/group preservation** — add a photo to the card in Contacts, sync after a CN
   edit → photo survives.
6. [x] **Edited-in-mac** — change the card's phone in Contacts (note unchanged in Obsidian),
   sync → row appears under edited-in-mac; test both Overwrite and Pull.
7. [x] **Orphan** — add a card to the group with no note, sync → orphan row; test Adopt
   (creates a CN) and Mark for deletion (adds to checklist, deletes nothing).
8. [x] **Suggestion** — a card with same name+email but no marker/id → suggestion row;
   Confirm links both sides.
9. [x] **Dry run** — with dry run on, verify report is produced but Contacts is untouched.
