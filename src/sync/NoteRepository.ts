import { App, TFile, normalizePath, stringifyYaml } from 'obsidian';

import { contactFileSlug } from '../core/slugify';
import type { ContactForgeSettings, ContactNote, LabeledValue, ManagedFields } from '../core/types';
import { newUuid } from '../core/uid';

function normalizeLabeledList(list: unknown): LabeledValue[] {
  if (!Array.isArray(list)) return [];
  return (list as unknown[]).map(item => {
    if (typeof item === 'string') return { label: 'other', value: item };
    const obj = item as Record<string, unknown> | null | undefined;
    const label = typeof obj?.label === 'string' ? obj.label : 'other';
    const value = typeof obj?.value === 'string' ? obj.value : '';
    return { label, value };
  });
}

/**
 * Reads, parses, and writes contact notes. This is the ONLY place that touches
 * the vault for contact data. Use app.fileManager.processFrontMatter for
 * frontmatter writes so we never clobber the note body.
 */
export class NoteRepository {
  constructor(
    private app: App,
    private settings: ContactForgeSettings
  ) {}

  listContactFiles(): Promise<TFile[]> {
    const folder = normalizePath(this.settings.contactsFolder);
    const prefix = folder ? `${folder}/` : '';
    return Promise.resolve(this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(prefix)));
  }

  parse(file: TFile): Promise<ContactNote> {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!fm || !fm.obsidian_uid) {
      throw new Error(`Contact note ${file.path} is missing obsidian_uid frontmatter`);
    }
    return Promise.resolve({
      path: file.path,
      obsidianUid: String(fm.obsidian_uid),
      macContactId: (fm.mac_contact_id as string | undefined) ?? null,
      managed: {
        firstName: (fm.first_name as string | undefined) ?? '',
        lastName: (fm.last_name as string | undefined) ?? '',
        org: (fm.org as string | undefined) ?? '',
        emails: normalizeLabeledList(fm.emails),
        phones: normalizeLabeledList(fm.phones),
        contactNote: (fm.contact_note as string | undefined) ?? ''
      },
      managedHash: (fm.cf_managed_hash as string | undefined) ?? null,
      syncedAt: (fm.cf_synced_at as string | undefined) ?? null,
      syncEnabled: fm.cf_sync !== false
    });
  }

  async writeSyncState(
    file: TFile,
    state: {
      macContactId?: string;
      managedHash?: string;
      syncedAt?: string;
      status?: string;
    }
  ): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      if (state.macContactId !== undefined) fm.mac_contact_id = state.macContactId;
      if (state.managedHash !== undefined) fm.cf_managed_hash = state.managedHash;
      if (state.syncedAt !== undefined) fm.cf_synced_at = state.syncedAt;
      if (state.status !== undefined) fm.cf_sync_status = state.status;
    });
  }

  async createFromTemplate(managed?: Partial<ManagedFields>): Promise<{ file: TFile; uid: string }> {
    const uid = newUuid();
    const managedFields: ManagedFields = {
      firstName: managed?.firstName ?? '',
      lastName: managed?.lastName ?? '',
      org: managed?.org ?? '',
      emails: managed?.emails ?? [],
      phones: managed?.phones ?? [],
      contactNote: managed?.contactNote ?? ''
    };
    const fm = {
      obsidian_uid: uid,
      mac_contact_id: null,
      first_name: managedFields.firstName,
      last_name: managedFields.lastName,
      org: managedFields.org,
      emails: managedFields.emails,
      phones: managedFields.phones,
      contact_note: managedFields.contactNote,
      cf_managed_hash: null,
      cf_synced_at: null,
      cf_sync_status: 'dirty'
    };

    const baseName = contactFileSlug(managedFields.firstName, managedFields.lastName) || 'new-contact';
    const folder = await this.resolveFolder(baseName);
    const path = await this.uniquePath(folder, baseName);
    const content = `---\n${stringifyYaml(fm)}---\n\n`;
    const file = await this.app.vault.create(path, content);
    return { file, uid };
  }

  /**
   * Renames every contact note in place so its filename and folder match the
   * current slug/grouping rules. Safe to run repeatedly: notes already in the
   * right spot are left untouched.
   */
  async sanitizeFilenames(): Promise<{ renamed: number; skipped: number; errors: string[] }> {
    const files = await this.listContactFiles();
    let renamed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const file of files) {
      try {
        const note = await this.parse(file);
        const baseName = contactFileSlug(note.managed.firstName, note.managed.lastName) || 'new-contact';
        const folder = await this.resolveFolder(baseName);
        const desiredPath = await this.uniquePath(folder, baseName, file.path);
        if (desiredPath === file.path) {
          skipped++;
          continue;
        }
        await this.app.fileManager.renameFile(file, desiredPath);
        renamed++;
      } catch (e) {
        errors.push(`${file.path}: ${(e as Error).message}`);
      }
    }

    return { renamed, skipped, errors };
  }

  /** Resolves (and creates, if missing) the folder a note with this slug belongs in. */
  private async resolveFolder(baseName: string): Promise<string> {
    const rootFolder = normalizePath(this.settings.contactsFolder);
    if (rootFolder && !this.app.vault.getAbstractFileByPath(rootFolder)) {
      await this.app.vault.createFolder(rootFolder);
    }

    if (!this.settings.groupByInitial) return rootFolder;

    const initial = baseName.charAt(0);
    const folder = normalizePath(rootFolder ? `${rootFolder}/${initial}` : initial);
    if (!this.app.vault.getAbstractFileByPath(folder)) {
      await this.app.vault.createFolder(folder);
    }
    return folder;
  }

  private uniquePath(folder: string, baseName: string, excludePath?: string): Promise<string> {
    let candidate = normalizePath(folder ? `${folder}/${baseName}.md` : `${baseName}.md`);
    let i = 2;
    while (candidate !== excludePath && this.app.vault.getAbstractFileByPath(candidate)) {
      candidate = normalizePath(folder ? `${folder}/${baseName}-${i}.md` : `${baseName}-${i}.md`);
      i++;
    }
    return Promise.resolve(candidate);
  }
}
