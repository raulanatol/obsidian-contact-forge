# Manual test checklist (JXA paths)

Unit tests cover hashing and reconciliation. The osascript paths need a real Mac.

**Status: validated on macOS, 2026-07-02 — all 9 scenarios pass. Scenarios 10-11 added
2026-07-03, not yet validated on a real Mac.**

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
10. [ ] **Sync all contacts** — enable "Sync all contacts", sync → cards outside the
        configured source group are read; every unmatched Mac contact shows up as an
        orphan row; newly created cards join no group; disable the toggle → source
        group field re-enables and only that group is scanned again.
11. [ ] **Initial import (one-time)** — with several orphan-mac cards present, run "Import
        all contacts from Mac into Obsidian (one-time)" → modal shows the correct count; Cancel does
        nothing; Confirm creates one note per orphan, stamps each card's marker, and
        marks each note in-sync; a card that errors (e.g. permission revoked mid-run)
        is reported without stopping the rest of the batch. Running the command again
        with zero orphans shows "No orphan Mac contacts to adopt."
        After a clean run, running the command again is refused ("already been done");
        after a run with errors, running it again imports only the remaining orphans.
12. [ ] **Abort on unreadable Contacts** — set the source group to a name that doesn't
        exist, sync → error Notice "Sync aborted, nothing was written"; no cards created.
13. [ ] **Auto-sync update** — enable "Sync automatically on edit", edit a synced note's
        org → ~3 s later the card updates, no modal; `cf_synced_at` refreshes and no
        second push follows (check with debug logging on). Editing only the note body
        makes no osascript call.
14. [ ] **Auto-sync create** — create a note from the template → nothing happens while it
        has no name or no email/phone; once both are filled, a card is created.
15. [ ] **Auto-sync conflict** — change a card's phone in Contacts, then edit the same note
        in Obsidian → Notice about the conflict; the card is not overwritten; the next
        manual sync shows it under edited-in-mac.
16. [ ] **Auto-sync paused during commands** — run a manual sync or the import with
        auto-sync on → no auto pushes interleave with the command.
17. [ ] **Labels** — push a note with `mobile`/`home`/`work`/`iphone` labels → Contacts shows
        the standard (localized) labels, not custom lowercase ones; an existing phone whose
        value is unchanged keeps its label and position.
