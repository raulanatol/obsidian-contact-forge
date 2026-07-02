# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An Obsidian plugin (macOS-only, `isDesktopOnly: true`) where Obsidian is the source of
truth for contacts, with a manual, one-way sync to macOS Contacts.app via JXA
(`osascript -l JavaScript`). It is the inverse of `raulanatol/obsidian-mac-sync-contacts`
(which pulls Mac → Obsidian).

**`docs/BUILD_PLAN.md` is the authoritative spec.** It contains the full data model,
matching precedence rules, hashing scheme, JXA bridge contract, desync-alert workflow,
and a file-by-file implementation map. Read it before making non-trivial changes —
this document only summarizes what's needed to navigate the code day to day.

## Commands

```bash
npm run dev     # esbuild watch build
npm run build   # tsc -noEmit typecheck, then production esbuild bundle -> main.js
npm test        # vitest run (pure unit tests: hash + reconciler)
npm run test:watch
```

Run a single test file: `npx vitest run tests/reconciler.test.ts`.

There is no lint script configured despite the eslint devDependencies being present.

## Architecture

### Data flow
One markdown note per contact under a configurable folder (default `Contacts/`).
Frontmatter holds the **managed** fields (name, org, emails, phones, `contact_note`) plus
sync bookkeeping (`obsidian_uid`, `mac_contact_id`, `cf_managed_hash`, `cf_synced_at`,
`cf_sync_status`). The note body is freeform and never synced. Managed fields are
push-only: Obsidian always wins, and edits made directly in Contacts get overwritten
(after being surfaced in a report, never silently).

### The reconciliation engine (core logic — `src/sync/Reconciler.ts`)
Pure, dependency-free module (no Obsidian/Node imports) that takes `{ notes, cards }`
and produces a `SyncPlan`. It never performs I/O or writes. Matching precedence, in order:
1. `cf-uid` marker stamped on the Mac card === note's `obsidian_uid` → strong match.
2. Cached `mac_contact_id` on the note === card id → strong match (heals the marker).
3. Heuristic (normalized name + shared email) → **suggestion only**, never auto-applied.

Every note/card pair lands in exactly one bucket: `in-sync`, `dirty` (push needed),
`orphan-mac` (card with no note — never auto-deleted), `edited-in-mac` (card diverged
from what was last written), or `suggestion`. Idempotency is a hard requirement:
running sync twice with no edits must produce zero writes — the reconciler test
(`tests/reconciler.test.ts`) is where that invariant is enforced.

### Hashing (`src/core/hash.ts`)
`canonicalize()` normalizes managed fields (trim, lowercase, sort emails/phones by
value) into an order-stable shape, then `fnv1a()` hashes the JSON of that shape. Both
note-side and card-side managed fields go through the same canonicalization before
comparison, so drift detection isn't fooled by ordering or casing differences. Keep this
deterministic across runs/machines — the whole sync model depends on it.

### macOS Contacts bridge (`src/contacts/MacContactsBridge.ts` + `src/contacts/jxa/*.js`)
JXA scripts (`dumpGroup.js`, `upsertCard.js`, `stampMarker.js`) are bundled as raw text
via esbuild's `.js -> text` loader (see `esbuild.config.mjs`) and invoked through
`child_process.execFile('osascript', ...)`. Rules that matter here:
- Never string-concatenate user data into a JXA script body — payloads travel only as a
  JSON argv/stdin argument, read back inside the script via `$.NSProcessInfo`.
- `upsertCard` must read-modify-write: photo, groups, and any unmanaged field must
  survive untouched.
- The Mac card carries a machine-readable `cf-uid:` marker plus a human `obsidian://`
  deep link in its note field, kept on separate lines, so matching survives Contacts
  re-indexing.
- TCC/permission errors (`-1743` / "Not authorized") must be classified by
  `src/contacts/permissions.ts` into guidance pointing at System Settings → Privacy &
  Security → Automation → Obsidian → Contacts.

### Orchestration (`src/sync/SyncEngine.ts`)
Wires together `NoteRepository` (reads/writes contact notes via
`FileManager.processFrontMatter` — no YAML lib, Obsidian's own parser/serializer),
`MacContactsBridge`, `reconcile()`, and `ReportWriter`. Respects `dryRun` (compute plan,
write no Mac changes) and `confirmBeforeWrite` (modal before writing). Per-card write
failures must land in an `error` bucket rather than aborting the whole run.

### Desync report & actions (`src/sync/ReportWriter.ts`, `src/sync/actions.ts`)
Every run regenerates a single report note (default `Contact Forge Sync Report.md`)
with one section per actionable bucket. Row actions are `obsidian://contact-forge?...`
protocol links handled in `src/main.ts`'s `registerObsidianProtocolHandler`, dispatching
to `Actions.adopt/markForDeletion/overwrite/pull/confirm`. The plugin never deletes a
Mac card itself — "mark for deletion" only appends to a checklist for the user.

### Current implementation state
Pure modules are complete and unit-tested: `core/hash.ts`, `core/uid.ts`,
`sync/Reconciler.ts`, `core/types.ts`. Everything touching Obsidian/Node/JXA I/O is a
stub with a `TODO` throw and an `IMPLEMENTATION NOTES for Claude Code` comment block
describing exactly what to build: `sync/SyncEngine.ts`, `contacts/MacContactsBridge.ts`,
`sync/NoteRepository.ts`, `sync/ReportWriter.ts`, `sync/actions.ts`,
`settings/SettingsTab.ts`, `ui/ConfirmModal.ts`, `ui/reportPostProcessor.ts`. Check a
file's own header comment and `docs/BUILD_PLAN.md` §9 before implementing it.

## Testing notes

- `Reconciler.ts` and `hash.ts` are pure by design specifically so they can be unit
  tested without a DOM or a Mac — keep new logic there free of Obsidian/Node imports.
- JXA-dependent paths (create, edit, orphan-adopt, edited-in-mac, dry-run,
  permission-denied) can't be unit tested headlessly; `docs/TESTING.md` has the manual
  checklist to run on an actual Mac.
