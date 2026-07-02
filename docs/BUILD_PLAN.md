# Contact Forge — Build Plan for Claude Code

> **Hand this file to Claude Code as the primary spec.** It is self-contained.
> Follow the phases in order. Each phase has an acceptance check. Do not skip the
> matching/reconciliation design in Phase 4 — it is the core of the plugin.

---

## 0. What we are building

An Obsidian plugin where **Obsidian is the source of truth** for contacts, with a
**one-way, user-controlled sync to macOS Contacts.app** via JXA (`osascript -l JavaScript`).

This is the inverse of the existing plugin `raulanatol/obsidian-mac-sync-contacts`
(which pulls Mac → Obsidian). We reuse its build tooling, esbuild config, release
workflow and JXA-invocation approach, but flip the data direction and add a
reconciliation engine plus a desync-alert workflow.

Prior art reviewed:
- `raulanatol/obsidian-mac-sync-contacts` — our base. Mac → Obsidian, template-driven,
  AppleScript. We keep the scaffolding, invert the flow, move to JXA.
- `czottmann/obsidian-people` — a *vault* (not a plugin) doing Obsidian → Contacts via
  Shortcuts + Dataview. Confirms the core design decisions we adopt:
  per-note UID (they use `p`+timestamp; we use a real UUID), a back-link from the Mac
  card to the source note, push-only fields, manual trigger, and "manual edits in
  Contacts get overwritten on sync". What it lacks and we add: a real plugin,
  native JXA (no Shortcuts dependency), desync detection, orphan adoption.

### Decisions locked in (do not re-litigate)
- **Trigger:** manual only — a command in the command palette. No file-save hook, no
  background timer in v1.
- **Managed fields (push-only, Obsidian overwrites Mac):** name (first/last), emails,
  phones, organization, note/notes. These are fully owned by Obsidian.
- **Orphan handling** (card exists in Mac's synced set but has no matching Obsidian
  note): never auto-delete. Instead raise a **desync alert** in a report note and let
  the user choose per row: *Adopt into Obsidian* or *Mark for deletion in Mac* (which
  only lists it for the user to delete manually).
- **Identity:** match by a stable `obsidian_uid` (UUID) that we also stamp into the Mac
  card, falling back to the cached `mac_contact_id`, and only using name+email as a
  weak heuristic to *suggest* (never to auto-write).

---

## 1. Naming & metadata

- **Plugin display name:** Contact Forge
- **Plugin id:** `contact-forge`
- **Repo:** `obsidian-contact-forge`
- **Tagline:** "Obsidian is the source of truth for your contacts; sync a chosen
  subset one-way to macOS Contacts."
- Requires `isDesktopOnly: true` (needs `child_process` + `osascript`; macOS only at runtime).

---

## 2. Tech stack & tooling

- TypeScript, esbuild (mirror the base repo's `esbuild.config.mjs`).
- Obsidian API (`obsidian` types), target ES2018, CommonJS output to `main.js`.
- No runtime npm deps beyond what Obsidian ships. UUID generation via
  `crypto.randomUUID()` (available in Obsidian's Electron). YAML via Obsidian's
  `parseYaml`/`stringifyYaml` and `FileManager.processFrontMatter` — do **not** add a
  YAML lib.
- JXA scripts live as `.js` string templates in `src/contacts/jxa/`, invoked through
  `child_process.execFile('osascript', ['-l', 'JavaScript', ...])`.
- Node built-ins used: `child_process`, `util.promisify`. Import them lazily inside
  desktop-only code paths.

Build scripts (package.json): `dev` (esbuild watch), `build` (tsc typecheck +
esbuild prod), `version` (version-bump.mjs). Copy the base repo's `version-bump.mjs`
and `versions.json` conventions verbatim.

---

## 3. Data model

### 3.1 Contact note (source of truth)
One markdown file per contact under a configurable folder (default `Contacts/`).
Frontmatter is the structured payload; body is freeform notes.

```yaml
---
obsidian_uid: 3f2a9c1e-...        # UUID, generated once, immutable, never edited by user
mac_contact_id: "ABPerson:12345"  # cache of Contacts identifier; may change, we heal it
first_name: "Ana"
last_name: "García"
org: "Zazume"
emails:
  - { label: "work",  value: "ana@zazume.com" }
  - { label: "home",  value: "ana@personal.com" }
phones:
  - { label: "mobile", value: "+34600111222" }
contact_note: "Met at PropTech Madrid 2025"   # maps to Contacts "note" field
cf_managed_hash: "a1b2c3d4"       # hash of managed fields at last successful sync
cf_synced_at: 2026-07-02T10:00:00Z
cf_sync_status: "in-sync"          # in-sync | dirty | orphan-mac | edited-in-mac | error
---

Freeform notes about Ana here. (NOT synced unless it's the contact_note field.)
```

> Rationale for `label/value` objects: Contacts fields are multivalued with labels.
> Storing them flat loses the label; storing them as objects lets us round-trip
> home/work/mobile faithfully. Provide a normalizer so users can also write a plain
> string and we coerce to `{label: "other", value}`.

### 3.2 Managed vs untouched fields
- **Managed (Obsidian writes, overwrites Mac):** first_name, last_name, org, emails,
  phones, contact_note.
- **Never touched by the plugin on the Mac card:** photo/image, groups, and any field
  not in the managed set. The JXA upsert must read-modify-write without clobbering
  these.

### 3.3 The Mac card back-link
On create/adopt, stamp into the card's `note` (or a dedicated URL field) an
`obsidian://` deep link built from the vault name + `obsidian_uid`, plus a machine
marker line `cf-uid: <uuid>` so we can reconcile even if Contacts reassigns its id.
Keep the human-facing deep link and the machine marker on separate lines.

---

## 4. Reconciliation engine (THE CORE — implement carefully)

Input: (a) all contact notes in the configured folder, (b) a JXA dump of the cards in
the configured **source set** (a named Contacts group / "smart list"; configurable).

### 4.1 Matching precedence
For each note and each card, resolve a match in this order:
1. **`cf-uid` marker** on the card === note's `obsidian_uid`  → strong match.
2. **`mac_contact_id`** cached on the note === card identifier   → strong match, then
   re-verify/repair the `cf-uid` marker.
3. **Heuristic** (normalized name AND any shared email) → *suggestion only*. Never
   writes automatically; surfaces in the report as "possible match, confirm?".

### 4.2 Buckets after matching
- **Matched pair:**
  - Compute `hash(managedFields(note))`.
  - If `hash === note.cf_managed_hash` AND card's managed fields still equal what we
    last wrote → **in-sync**, skip.
  - If `hash !== note.cf_managed_hash` → note changed in Obsidian → **dirty** →
    `upsert` card, then write back new `cf_managed_hash` + `cf_synced_at`.
  - If `hash === note.cf_managed_hash` but the **card's** managed fields diverge from
    last-written → someone edited in Mac → **edited-in-mac**. Because Obsidian is
    source of truth, we do NOT silently overwrite in v1: raise an alert row
    ("destination edited; overwrite from Obsidian? / pull change into Obsidian?").
- **Note only** (has `obsidian_uid`, no card): create card, stamp marker, cache
  `mac_contact_id`, set hash. Respect a per-note `cf_sync: false` opt-out.
- **Card only** (in source set, no matching note): **orphan-mac** → desync alert with
  two offered actions (Adopt / Mark-for-deletion). Never delete automatically.

### 4.3 Hashing
`managedFields()` returns a canonical, order-stable object (sort emails/phones by
value, lowercase, trim). Hash with a small stable function (e.g. FNV-1a over the JSON).
Keep it deterministic so the same content always yields the same hash across runs.

### 4.4 Idempotency requirement
Running sync twice with no edits must produce **zero writes** on the second run and an
empty report. Add an integration-style test asserting this.

---

## 5. macOS Contacts access layer (JXA)

`src/contacts/MacContactsBridge.ts` wraps three JXA scripts:

- `dumpGroup(groupName)` → returns JSON array of cards: `{ id, firstName, lastName,
  org, emails:[{label,value}], phones:[{label,value}], note, cfUid|null }`.
- `upsertCard(card)` → create if `id` absent else update by `id`; write only managed
  fields; preserve image/groups/others; ensure card is a member of the source group;
  return the (possibly new) `id`.
- `stampMarker(id, uuid, deepLink)` → idempotently ensure the `cf-uid:` marker + deep
  link exist in the note field.

Implementation notes:
- Invoke via `execFile('osascript', ['-l','JavaScript','-e', script])` OR write the
  script to a temp file and pass its path (preferred for large scripts — avoids
  arg-length and quoting hell). Pass structured input as a single JSON string argument
  read via `$.NSProcessInfo` args or stdin; return output as JSON on stdout.
- Parse stdout as JSON; treat any non-JSON stdout or non-zero exit as an error with the
  captured stderr surfaced to the user.
- **TCC / permissions:** the first call will trigger the macOS Automation → Contacts
  consent prompt. Detect the `-1743` / "Not authorized" error class and show a Notice
  with the exact path: System Settings → Privacy & Security → Automation → Obsidian →
  Contacts. Provide a "Test Contacts access" command that does a no-op read to trigger
  the prompt deliberately.
- Never shell out with string concatenation of user data into the script body — pass
  data only as JSON payload, never interpolated into code.

---

## 6. Desync alert workflow

On each sync, build a report and write/overwrite `Contact Forge Sync Report.md` at a
configurable location (default vault root). Structure:

- **Summary line:** counts per bucket (synced / created / dirty→updated /
  edited-in-mac / orphan-mac / suggestions / errors).
- **Action tables**, one section per actionable bucket. Each row lists identifying
  fields and the offered actions rendered as clickable command links
  (`obsidian://` URIs handled by the plugin, or buttons if you add a small markdown
  post-processor). Actions:
  - **orphan-mac →** `Adopt` (create note, generate UUID, stamp marker, cache id,
    mark in-sync) | `Mark for deletion` (append to a "To delete in Mac" checklist; the
    plugin never deletes).
  - **edited-in-mac →** `Overwrite from Obsidian` (treat as dirty, push) | `Pull into
    Obsidian` (update note frontmatter from card, recompute hash).
  - **suggestion →** `Confirm match` (link note↔card, set ids/markers) | `Ignore`.
- Report is regenerated each run; completed actions drop off naturally on the next sync.

Implement actions as registered plugin commands that take a `uid`/`cardId` param via a
custom `obsidian://contact-forge?...` protocol handler (`registerObsidianProtocolHandler`).

---

## 7. Settings

`src/settings/SettingsTab.ts` + `Settings` type with defaults:
- `contactsFolder` (default `"Contacts"`)
- `sourceGroupName` — the Contacts group to treat as the synced set (default e.g.
  `"Obsidian"`). All creates join this group; only this group is scanned for orphans.
- `reportPath` (default `"Contact Forge Sync Report.md"`)
- `deepLinkVaultName` (auto-detected from `app.vault.getName()`, overridable)
- `managedFields` toggles per field (default: all on) — even though the user chose
  "all standard fields", expose toggles so it stays flexible.
- `dryRun` (default `false`) — compute the report and intended writes but perform no
  Mac writes. Strongly recommend defaulting new users to try dry-run first.
- `confirmBeforeWrite` (default `true`) — show a modal summarizing planned changes
  before touching Contacts.

---

## 8. Commands (command palette)

- **Contact Forge: Sync contacts to Mac** (main entry; honors dryRun/confirm).
- **Contact Forge: Dry-run (report only, no writes).**
- **Contact Forge: Test Contacts access** (triggers TCC prompt, reports result).
- **Contact Forge: Create contact note from template** (scaffolds a new CN with a
  fresh UUID and empty managed fields).
- **Contact Forge: Open sync report.**

---

## 9. File-by-file implementation map

```
src/
  main.ts                     # Plugin entry: load settings, register commands,
                              #   protocol handler, settings tab.
  core/
    types.ts                  # ContactNote, MacCard, ManagedFields, SyncStatus, Bucket,
                              #   Settings, ReportModel.
    hash.ts                   # canonicalize(managed) + fnv1a(json) => stable hash.
    uid.ts                    # newUuid(), deepLink(vault, uid), markerLine(uid).
    log.ts                    # thin Notice + console logger with levels.
  contacts/
    MacContactsBridge.ts      # dumpGroup/upsertCard/stampMarker via osascript.
    jxa/
      dumpGroup.js            # JXA source (string import or raw .js loaded at build).
      upsertCard.js
      stampMarker.js
    permissions.ts            # detect TCC errors, human-readable guidance.
  sync/
    NoteRepository.ts         # read/parse/write contact notes via processFrontMatter.
    Reconciler.ts             # the Phase-4 engine: match -> bucketize -> plan.
    SyncEngine.ts             # orchestrates: read notes + cards, reconcile, apply
                              #   plan (respecting dryRun/confirm), write report.
    ReportWriter.ts           # renders ReportModel to markdown with action links.
    actions.ts                # adopt / markForDeletion / overwrite / pull / confirm.
  ui/
    ConfirmModal.ts           # pre-write summary modal.
    reportPostProcessor.ts    # optional: render action links as buttons.
  settings/
    Settings.ts               # defaults + load/save.
    SettingsTab.ts            # PluginSettingTab UI.
```

---

## 10. Phased delivery & acceptance checks

**Phase A — Scaffold & load.** Plugin builds, loads in Obsidian, registers all
commands (stubbed), settings tab renders. *Accept:* `npm run build` clean; plugin
enables with no console errors.

**Phase B — Note repository.** Read/parse/write CNs, generate UUIDs, template command
creates a valid CN. *Accept:* create-from-template produces a note with a UUID and
round-trips through parse→serialize unchanged.

**Phase C — Contacts bridge (read).** `dumpGroup` returns real cards as JSON; "Test
access" command triggers and detects TCC. *Accept:* on a Mac with a test group,
dump returns the expected cards; denying permission yields the guidance Notice.

**Phase D — Reconciler.** Pure, unit-tested matching + bucketization against fixture
data (no Mac needed). *Accept:* unit tests cover all buckets incl. idempotency (second
run = no writes) and the three matching precedences.

**Phase E — Writes.** `upsertCard`/`stampMarker`; SyncEngine applies plan with
dryRun + confirm modal. *Accept:* creating and editing a CN then syncing produces the
right card; photo/groups untouched; second sync writes nothing.

**Phase F — Desync report & actions.** Report generated; adopt/overwrite/pull/confirm
actions work via protocol handler. *Accept:* an orphan card can be adopted into a new
CN; an in-Mac edit surfaces and both resolutions work.

**Phase G — Release plumbing.** GitHub Action builds `main.js`+`manifest.json`+
`styles.css` on tag; docs complete. *Accept:* tagging produces a release with the three
artifacts attached.

---

## 11. Testing

- Unit tests for `hash.ts`, `uid.ts`, `Reconciler.ts` with fixtures in
  `tests/fixtures/`. Use a lightweight runner (e.g. `vitest` or `jest` — pick one, wire
  into `npm test`). The Reconciler must be pure (no Obsidian/Mac imports) so it tests
  without a DOM.
- Manual test checklist in `docs/TESTING.md` for the JXA paths (can't be unit-tested
  headlessly): create, edit, orphan-adopt, edited-in-mac, dry-run, permission-denied.

---

## 12. Obsidian community-plugin submission checklist

- `manifest.json`: `id: contact-forge`, `isDesktopOnly: true`, correct `minAppVersion`,
  no trailing junk. `version` matches the git tag.
- `versions.json` maps plugin version → minAppVersion.
- No `console.log` spam in production; use the logger gated by a debug setting.
- No use of private/undocumented Obsidian APIs; prefer `processFrontMatter`,
  `Vault`, `MetadataCache`.
- README with clear macOS-only + permissions disclosure, screenshots, and a prominent
  "Obsidian is the source of truth; Mac edits get overwritten" warning.
- LICENSE (MIT).
- Add entry to `community-plugins.json` via PR to `obsidianmd/obsidian-releases`
  (see docs/SUBMISSION.md).
- Security note in README: the plugin runs `osascript` locally, reads/writes only the
  configured Contacts group, sends nothing off-device. This matches a privacy-first
  posture.

---

## 13. Explicit non-goals for v1
- No automatic/scheduled sync.
- No Mac → Obsidian bulk import (only per-row adopt from the report).
- No iOS support (runtime is macOS-only; iOS benefits indirectly via iCloud).
- No conflict auto-merge — conflicts always go to the report for a human decision.
