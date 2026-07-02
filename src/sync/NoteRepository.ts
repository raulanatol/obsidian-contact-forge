import { App, TFile, normalizePath, stringifyYaml } from "obsidian";
import type { ContactForgeSettings, ContactNote, LabeledValue, ManagedFields } from "../core/types";
import { newUuid } from "../core/uid";

function normalizeLabeledList(list: unknown): LabeledValue[] {
  if (!Array.isArray(list)) return [];
  return list.map((item) =>
    typeof item === "string"
      ? { label: "other", value: item }
      : { label: String(item?.label ?? "other"), value: String(item?.value ?? "") }
  );
}

/**
 * Reads, parses, and writes contact notes. This is the ONLY place that touches
 * the vault for contact data. Use app.fileManager.processFrontMatter for
 * frontmatter writes so we never clobber the note body.
 */
export class NoteRepository {
  constructor(private app: App, private settings: ContactForgeSettings) {}

  async listContactFiles(): Promise<TFile[]> {
    const folder = normalizePath(this.settings.contactsFolder);
    const prefix = folder ? `${folder}/` : "";
    return this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(prefix));
  }

  async parse(file: TFile): Promise<ContactNote> {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!fm || !fm.obsidian_uid) {
      throw new Error(`Contact note ${file.path} is missing obsidian_uid frontmatter`);
    }
    return {
      path: file.path,
      obsidianUid: String(fm.obsidian_uid),
      macContactId: fm.mac_contact_id ?? null,
      managed: {
        firstName: fm.first_name ?? "",
        lastName: fm.last_name ?? "",
        org: fm.org ?? "",
        emails: normalizeLabeledList(fm.emails),
        phones: normalizeLabeledList(fm.phones),
        contactNote: fm.contact_note ?? "",
      },
      managedHash: fm.cf_managed_hash ?? null,
      syncedAt: fm.cf_synced_at ?? null,
      syncEnabled: fm.cf_sync !== false,
    };
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
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      if (state.macContactId !== undefined) fm.mac_contact_id = state.macContactId;
      if (state.managedHash !== undefined) fm.cf_managed_hash = state.managedHash;
      if (state.syncedAt !== undefined) fm.cf_synced_at = state.syncedAt;
      if (state.status !== undefined) fm.cf_sync_status = state.status;
    });
  }

  async createFromTemplate(
    managed?: Partial<ManagedFields>
  ): Promise<{ file: TFile; uid: string }> {
    const uid = newUuid();
    const managedFields: ManagedFields = {
      firstName: managed?.firstName ?? "",
      lastName: managed?.lastName ?? "",
      org: managed?.org ?? "",
      emails: managed?.emails ?? [],
      phones: managed?.phones ?? [],
      contactNote: managed?.contactNote ?? "",
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
      cf_sync_status: "dirty",
    };

    const folder = normalizePath(this.settings.contactsFolder);
    if (folder && !this.app.vault.getAbstractFileByPath(folder)) {
      await this.app.vault.createFolder(folder);
    }

    const baseName =
      [managedFields.firstName, managedFields.lastName].filter(Boolean).join(" ").trim() ||
      "New Contact";
    const path = await this.uniquePath(folder, baseName);
    const content = `---\n${stringifyYaml(fm)}---\n\n`;
    const file = await this.app.vault.create(path, content);
    return { file, uid };
  }

  private async uniquePath(folder: string, baseName: string): Promise<string> {
    let candidate = normalizePath(folder ? `${folder}/${baseName}.md` : `${baseName}.md`);
    let i = 2;
    while (this.app.vault.getAbstractFileByPath(candidate)) {
      candidate = normalizePath(folder ? `${folder}/${baseName} ${i}.md` : `${baseName} ${i}.md`);
      i++;
    }
    return candidate;
  }
}
