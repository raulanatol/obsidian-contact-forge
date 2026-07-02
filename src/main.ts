import { Plugin } from 'obsidian';

import { MacContactsBridge } from './contacts/MacContactsBridge';
import { setDebug, log } from './core/log';
import type { ContactForgeSettings } from './core/types';
import { loadSettings, saveSettings } from './settings/Settings';
import { ContactForgeSettingTab } from './settings/SettingsTab';
import { Actions } from './sync/actions';
import { NoteRepository } from './sync/NoteRepository';
import { SyncEngine } from './sync/SyncEngine';
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
          const r = await this.bridge.testAccess(this.settings.sourceGroupName);
          log.notice(r.message);
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

    // Report action links: obsidian://contact-forge?action=...&uid=...&cardId=...
    this.registerObsidianProtocolHandler('contact-forge', async params => {
      await this.safeRun(async () => {
        const { action, uid, cardId } = params as Record<string, string>;
        switch (action) {
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
            log.notice(`Unknown action: ${action}`);
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
