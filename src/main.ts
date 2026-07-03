import { Plugin } from 'obsidian';

import { MacContactsBridge } from './contacts/MacContactsBridge';
import { fullName } from './core/format';
import { setDebug, log } from './core/log';
import type { Bucket, ContactForgeSettings } from './core/types';
import { loadSettings, saveSettings } from './settings/Settings';
import { ContactForgeSettingTab } from './settings/SettingsTab';
import { Actions } from './sync/actions';
import { NoteRepository } from './sync/NoteRepository';
import { SyncEngine } from './sync/SyncEngine';
import { BulkAdoptModal } from './ui/BulkAdoptModal';
import { registerReportPostProcessor } from './ui/reportPostProcessor';

export default class ContactForgePlugin extends Plugin {
  settings!: ContactForgeSettings;
  private engine!: SyncEngine;
  private bridge = new MacContactsBridge();
  private actions!: Actions;

  async onload(): Promise<void> {
    this.settings = await loadSettings(this);
    setDebug(this.settings.debug);

    this.engine = new SyncEngine(this.app, this.settings);
    this.actions = new Actions(this.app, this.settings);

    this.addSettingTab(new ContactForgeSettingTab(this.app, this));
    registerReportPostProcessor(this);

    this.addCommand({
      id: 'sync-contacts-to-mac',
      name: 'Sync contacts to Mac',
      callback: () => this.safeRun(() => this.engine.run({ dryRun: false }))
    });

    this.addCommand({
      id: 'dry-run',
      name: 'Dry-run (report only, no writes)',
      callback: () => this.safeRun(() => this.engine.run({ dryRun: true }))
    });

    this.addCommand({
      id: 'test-contacts-access',
      name: 'Test Contacts access',
      callback: () =>
        this.safeRun(async () => {
          const r = await this.bridge.testAccess(this.settings.syncAllContacts ? null : this.settings.sourceGroupName);
          log.notice(r.message);
        })
    });

    this.addCommand({
      id: 'bulk-adopt-orphans',
      name: 'Bulk adopt all orphan contacts into Obsidian',
      callback: () =>
        this.safeRun(async () => {
          const plan = await this.engine.run({ dryRun: true });
          const orphanCards = plan.buckets
            .filter((b): b is Extract<Bucket, { kind: 'orphan-mac' }> => b.kind === 'orphan-mac')
            .map(b => b.card);

          if (orphanCards.length === 0) {
            log.notice('No orphan Mac contacts to adopt.');
            return;
          }

          const confirmed = await new BulkAdoptModal(this.app, orphanCards.length).openAndWait();
          if (!confirmed) return;

          const { adopted, errors } = await this.actions.bulkAdopt(orphanCards);
          log.notice(
            `Adopted ${adopted} contact${adopted === 1 ? '' : 's'}` +
              (errors.length ? `, ${errors.length} failed` : '') +
              '. Run a sync to refresh the report.'
          );
          errors.forEach(({ card, message }) => log.error(`bulk-adopt-orphans: ${fullName(card)}`, message));
        })
    });

    this.addCommand({
      id: 'create-contact-note',
      name: 'Create contact note from template',
      callback: () =>
        this.safeRun(async () => {
          const repo = new NoteRepository(this.app, this.settings);
          const { file } = await repo.createFromTemplate();
          await this.app.workspace.getLeaf(true).openFile(file);
        })
    });

    this.addCommand({
      id: 'sanitize-contact-filenames',
      name: 'Sanitize contact note filenames',
      callback: () =>
        this.safeRun(async () => {
          const repo = new NoteRepository(this.app, this.settings);
          const { renamed, skipped, errors } = await repo.sanitizeFilenames();
          log.notice(
            `Sanitized filenames: ${renamed} renamed, ${skipped} already correct` +
              (errors.length ? `, ${errors.length} failed` : '')
          );
          errors.forEach(e => log.error('sanitize-contact-filenames', e));
        })
    });

    this.addCommand({
      id: 'open-sync-report',
      name: 'Open sync report',
      callback: () =>
        this.safeRun(async () => {
          const f = this.app.vault.getAbstractFileByPath(this.settings.reportPath);
          if (f && 'extension' in f) {
            await this.app.workspace.getLeaf(false).openFile(f as never);
          } else {
            log.notice('No report yet. Run a sync first.');
          }
        })
    });

    // Report action links: obsidian://contact-forge?op=...&uid=...&cardId=...
    this.registerObsidianProtocolHandler('contact-forge', async params => {
      await this.safeRun(async () => {
        const { op, uid, cardId } = params as Record<string, string>;
        switch (op) {
          case 'adopt':
            return this.actions.adopt(cardId);
          case 'mark-delete':
            return this.actions.markForDeletion(cardId);
          case 'overwrite':
            return this.actions.overwrite(uid);
          case 'pull':
            return this.actions.pull(uid, cardId);
          case 'confirm':
            return this.actions.confirm(uid, cardId);
          default:
            log.notice(`Unknown action: ${op}`);
        }
      });
    });

    log.info('Contact Forge loaded');
  }

  async persist(): Promise<void> {
    setDebug(this.settings.debug);
    await saveSettings(this, this.settings);
  }

  private async safeRun(fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
    } catch (e) {
      log.error('command failed', e);
      log.notice((e as Error).message);
    }
  }
}
