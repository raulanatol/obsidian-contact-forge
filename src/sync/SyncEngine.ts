import { App, TFile } from 'obsidian';

import { MacContactsBridge } from '../contacts/MacContactsBridge';
import { hashManaged } from '../core/hash';
import { log } from '../core/log';
import type { ContactForgeSettings, ContactNote, MacCard, SyncPlan } from '../core/types';
import { macNoteBlock } from '../core/uid';
import { ConfirmModal } from '../ui/ConfirmModal';

import { decide, preflight } from './autoSyncPolicy';
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
export type AutoSyncResult =
  | { status: 'skipped' }
  | { status: 'pushed'; note: ContactNote }
  | { status: 'conflict'; note: ContactNote }
  | { status: 'error'; note: ContactNote; message: string };

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
    const parseErrors: string[] = [];
    for (const file of files) {
      try {
        notes.push(await this.notes.parse(file));
      } catch (e) {
        log.error(`Failed to parse contact note ${file.path}`, e);
        parseErrors.push((e as Error).message);
      }
    }

    // If Contacts can't be read, abort: reconciling against an empty card list
    // would turn every note into a "create" and duplicate the whole address book.
    let cards: MacCard[];
    try {
      cards = await this.bridge.dumpGroup(this.settings.syncAllContacts ? null : this.settings.sourceGroupName);
    } catch (e) {
      log.error('Failed to read Mac Contacts', e);
      throw new Error(`Sync aborted, nothing was written: could not read Contacts.app. ${(e as Error).message}`);
    }

    const plan = reconcile({ notes, cards });
    for (const message of parseErrors) {
      plan.buckets.push({ kind: 'error', message });
      plan.counts.error = (plan.counts.error ?? 0) + 1;
    }
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

  /**
   * Auto-sync entry point: push a single edited note, following the same rules as
   * a full run (see autoSyncPolicy). Reads at most one card from Contacts.
   */
  async syncNote(file: TFile): Promise<AutoSyncResult> {
    let note: ContactNote;
    try {
      note = await this.notes.parse(file);
    } catch {
      return { status: 'skipped' }; // not a contact note (yet): no obsidian_uid
    }

    const pre = preflight(note);
    if (pre.action === 'skip') return { status: 'skipped' };

    const card =
      pre.action === 'fetch-card'
        ? await this.bridge.getCard(pre.cardId, this.settings.syncAllContacts ? null : this.settings.sourceGroupName)
        : null;
    const related = await this.notes.findRelated(note, card?.cfUid ?? null);
    const decision = decide(note, related, card);

    switch (decision.action) {
      case 'skip':
        return { status: 'skipped' };
      case 'conflict':
        return { status: 'conflict', note };
      case 'error':
        return { status: 'error', note, message: decision.message };
      case 'push': {
        if (this.settings.dryRun) return { status: 'skipped' };
        const vaultName = this.settings.deepLinkVaultName ?? this.app.vault.getName();
        await this.push(note, decision.cardId, vaultName, file);
        return { status: 'pushed', note };
      }
    }
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
      await this.push(note, cardId, vaultName, file);
    } catch (e) {
      plan.buckets.push({ kind: 'error', note, message: (e as Error).message });
      plan.counts.error = (plan.counts.error ?? 0) + 1;
      log.error(`Failed to sync contact ${note.path}`, e);
    }
  }

  private async push(note: ContactNote, cardId: string | null, vaultName: string, file: TFile): Promise<void> {
    const { id } = await this.bridge.upsertCard({
      id: cardId,
      managed: note.managed,
      group: this.settings.syncAllContacts ? null : this.settings.sourceGroupName,
      noteBlock: macNoteBlock(vaultName, note.obsidianUid)
    });
    await this.notes.writeSyncState(file, {
      macContactId: id,
      managedHash: hashManaged(note.managed),
      syncedAt: new Date().toISOString(),
      status: 'in-sync'
    });
  }
}
