import { App } from "obsidian";
import type { ContactForgeSettings, SyncPlan } from "../core/types";
import { NoteRepository } from "./NoteRepository";
import { MacContactsBridge } from "../contacts/MacContactsBridge";
import { reconcile } from "./Reconciler";
import { ReportWriter } from "./ReportWriter";
import { macNoteBlock } from "../core/uid";
import { hashManaged } from "../core/hash";
import { log } from "../core/log";

/**
 * Orchestrates a full sync run:
 *   1. read notes (NoteRepository) + cards (MacContactsBridge.dumpGroup)
 *   2. reconcile() -> SyncPlan
 *   3. if confirmBeforeWrite: show ConfirmModal with plan.counts
 *   4. unless dryRun: apply toCreate + toUpdate via upsertCard/stampMarker,
 *      then writeSyncState back to each note (new hash, id, syncedAt, status)
 *   5. ReportWriter.write(plan) -> report note
 *
 * IMPLEMENTATION NOTES for Claude Code:
 * - vaultName = settings.deepLinkVaultName ?? app.vault.getName()
 * - For each create/update, noteBlock = macNoteBlock(vaultName, note.obsidianUid)
 * - After a successful upsert, recompute hashManaged(note.managed) and persist.
 * - Wrap each card write in try/catch; push failures into an "error" bucket rather
 *   than aborting the whole run.
 */
export class SyncEngine {
  constructor(
    private app: App,
    private settings: ContactForgeSettings,
    private notes = new NoteRepository(app, settings),
    private bridge = new MacContactsBridge(),
    private report = new ReportWriter(app, settings)
  ) {}

  async run(opts: { dryRun?: boolean } = {}): Promise<SyncPlan> {
    const dryRun = opts.dryRun ?? this.settings.dryRun;
    void macNoteBlock; void hashManaged; void reconcile; void log;
    void this.notes; void this.bridge; void this.report; void dryRun;
    throw new Error("TODO: implement orchestration per the notes above");
  }
}
