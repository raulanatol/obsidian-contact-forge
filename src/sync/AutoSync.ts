import { normalizePath, Plugin, TFile } from 'obsidian';

import { fullName } from '../core/format';
import { log } from '../core/log';
import type { ContactForgeSettings } from '../core/types';

import type { SyncEngine } from './SyncEngine';

/**
 * Pushes a contact note to Contacts.app shortly after it is edited.
 *
 * - Debounced per note, so typing doesn't fire one osascript call per keystroke.
 * - Serialized: at most one push in flight; Contacts.app is not re-entrant.
 * - Pausable: manual commands (full sync, import, report actions) run with
 *   auto-sync paused. Edits seen meanwhile are deferred, not dropped, and replayed
 *   afterwards — most become no-ops via the local hash check in preflight().
 * - Silent on success; only conflicts and errors raise a Notice.
 */
export class AutoSync {
  private timers = new Map<string, number>();
  private deferred = new Set<string>();
  private pauseDepth = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private plugin: Plugin,
    private settings: ContactForgeSettings,
    private engine: SyncEngine,
    private delayMs = 3000
  ) {}

  start(): void {
    this.plugin.registerEvent(
      this.plugin.app.metadataCache.on('changed', file => {
        if (this.settings.autoSync && this.isContactFile(file)) this.schedule(file.path);
      })
    );
    this.plugin.register(() => this.clearTimers());
  }

  /** Run `fn` with auto-sync paused, waiting for any in-flight push first. */
  async pause<T>(fn: () => Promise<T>): Promise<T> {
    this.pauseDepth++;
    try {
      await this.queue;
      return await fn();
    } finally {
      this.pauseDepth--;
      if (this.pauseDepth === 0) {
        const paths = [...this.deferred];
        this.deferred.clear();
        paths.forEach(p => this.schedule(p));
      }
    }
  }

  private isContactFile(file: TFile): boolean {
    const folder = normalizePath(this.settings.contactsFolder);
    const prefix = folder ? `${folder}/` : '';
    return (
      file.extension === 'md' && file.path.startsWith(prefix) && file.path !== normalizePath(this.settings.reportPath)
    );
  }

  private schedule(path: string): void {
    const existing = this.timers.get(path);
    if (existing !== undefined) window.clearTimeout(existing);
    this.timers.set(
      path,
      window.setTimeout(() => {
        this.timers.delete(path);
        this.enqueue(path);
      }, this.delayMs)
    );
  }

  private enqueue(path: string): void {
    if (this.pauseDepth > 0) {
      this.deferred.add(path);
      return;
    }
    this.queue = this.queue.then(() => this.process(path));
  }

  private async process(path: string): Promise<void> {
    if (this.pauseDepth > 0) {
      this.deferred.add(path);
      return;
    }
    if (!this.settings.autoSync) return;
    const file = this.plugin.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return; // deleted or renamed meanwhile

    try {
      const result = await this.engine.syncNote(file);
      switch (result.status) {
        case 'pushed':
          log.info(`auto-sync: pushed ${path}`);
          break;
        case 'conflict':
          log.notice(
            `"${fullName(result.note.managed)}" was also edited in Contacts. ` +
              'Run "Sync contacts to Mac" and resolve it in the report.'
          );
          break;
        case 'error':
          log.notice(`Auto-sync skipped "${fullName(result.note.managed)}": ${result.message}`);
          break;
      }
    } catch (e) {
      log.error(`auto-sync failed for ${path}`, e);
      log.notice(`Auto-sync failed for ${path}: ${(e as Error).message}`);
    }
  }

  private clearTimers(): void {
    this.timers.forEach(t => window.clearTimeout(t));
    this.timers.clear();
  }
}
