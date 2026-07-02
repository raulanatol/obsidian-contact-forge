import { App, TFile } from 'obsidian';

import { MacContactsBridge } from '../contacts/MacContactsBridge';
import { hashManaged } from '../core/hash';
import { log } from '../core/log';
import type { ContactForgeSettings, ContactNote, SyncPlan } from '../core/types';
import { macNoteBlock } from '../core/uid';
import { ConfirmModal } from '../ui/ConfirmModal';

import { NoteRepository } from './NoteRepository';
import { reconcile } from './Reconciler';
import { ReportWriter } from './ReportWriter';

/**
 * Orchestrates a full sync run:
 *   1. read notes (NoteRepository) + cards (MacContactsBridge.dumpGroup)
 *   2. reconcile() -> SyncPlan
 *   3. if confirmBeforeWrite and there is something to write: show ConfirmModal
 *   4. unless dryRun: apply toCreate + toUpdate via upsertCard, then writeSyncState
 *      back to each note (new hash, id, syncedAt, status)
 *   5. ReportWriter.write(plan) -> report note (Phase F; failures here must not
 *      abort a sync that already applied writes)
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

    const files = await this.notes.listContactFiles();
    const byPath = new Map(files.map(f => [f.path, f]));
    const notes: ContactNote[] = [];
    for (const file of files) {
      try {
        notes.push(await this.notes.parse(file));
      } catch (e) {
        log.error(`Failed to parse contact note ${file.path}`, e);
      }
    }

    let cards = [] as Awaited<ReturnType<MacContactsBridge['dumpGroup']>>;
    try {
      cards = await this.bridge.dumpGroup(this.settings.sourceGroupName);
    } catch (e) {
      log.error('Failed to read Mac Contacts group', e);
      log.notice((e as Error).message);
    }

    const plan = reconcile({ notes, cards });
    const hasWrites = plan.toCreate.length > 0 || plan.toUpdate.length > 0;

    if (this.settings.confirmBeforeWrite && !dryRun && hasWrites) {
      const confirmed = await new ConfirmModal(this.app, plan).openAndWait();
      if (!confirmed) return plan;
    }

    if (!dryRun) {
      const vaultName = this.settings.deepLinkVaultName ?? this.app.vault.getName();

      for (const note of plan.toCreate) {
        await this.pushNote(note, null, vaultName, byPath, plan);
      }
      for (const { note, card } of plan.toUpdate) {
        await this.pushNote(note, card.id, vaultName, byPath, plan);
      }
    }

    try {
      await this.report.write(plan);
    } catch (e) {
      log.error('Failed to write sync report', e);
    }

    return plan;
  }

  private async pushNote(
    note: ContactNote,
    cardId: string | null,
    vaultName: string,
    byPath: Map<string, TFile>,
    plan: SyncPlan
  ): Promise<void> {
    const file = byPath.get(note.path);
    if (!file) return;
    try {
      const { id } = await this.bridge.upsertCard({
        id: cardId,
        managed: note.managed,
        group: this.settings.sourceGroupName,
        noteBlock: macNoteBlock(vaultName, note.obsidianUid)
      });
      await this.notes.writeSyncState(file, {
        macContactId: id,
        managedHash: hashManaged(note.managed),
        syncedAt: new Date().toISOString(),
        status: 'in-sync'
      });
    } catch (e) {
      plan.buckets.push({ kind: 'error', note, message: (e as Error).message });
      plan.counts.error = (plan.counts.error ?? 0) + 1;
      log.error(`Failed to sync contact ${note.path}`, e);
    }
  }
}
