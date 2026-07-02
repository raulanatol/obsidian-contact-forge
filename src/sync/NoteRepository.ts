import { App, TFile, normalizePath, stringifyYaml } from "obsidian";
import type { ContactForgeSettings, ContactNote, ManagedFields } from "../core/types";
import { newUuid } from "../core/uid";
import { hashManaged } from "../core/hash";

/**
 * Reads, parses, and writes contact notes. This is the ONLY place that touches
 * the vault for contact data. Use app.fileManager.processFrontMatter for
 * frontmatter writes so we never clobber the note body.
 *
 * IMPLEMENTATION NOTES for Claude Code:
 * - listContactFiles(): return all TFiles under settings.contactsFolder.
 * - parse(file): read frontmatter via app.metadataCache.getFileCache(file)?.frontmatter
 *   and coerce into ContactNote. emails/phones may be either strings or {label,value}
 *   objects in YAML — normalize both into LabeledValue[] (string -> {label:"other"}).
 * - writeSyncState(file, {macContactId, managedHash, syncedAt, status}): update ONLY
 *   those frontmatter keys via processFrontMatter.
 * - createFromTemplate(): create a new note with a fresh obsidian_uid and empty
 *   managed fields; used by the "Create contact note" command and by adopt().
 */
export class NoteRepository {
  constructor(private app: App, private settings: ContactForgeSettings) {}

  async listContactFiles(): Promise<TFile[]> {
    throw new Error("TODO: list markdown files under settings.contactsFolder");
  }

  async parse(_file: TFile): Promise<ContactNote> {
    throw new Error("TODO: parse frontmatter -> ContactNote (normalize emails/phones)");
  }

  async writeSyncState(
    _file: TFile,
    _state: {
      macContactId?: string;
      managedHash?: string;
      syncedAt?: string;
      status?: string;
    }
  ): Promise<void> {
    throw new Error("TODO: processFrontMatter to persist sync state keys only");
  }

  async createFromTemplate(managed?: Partial<ManagedFields>): Promise<TFile> {
    // Skeleton showing intended shape; Claude Code to finish path handling + write.
    const uid = newUuid();
    const fm = {
      obsidian_uid: uid,
      mac_contact_id: null,
      first_name: managed?.firstName ?? "",
      last_name: managed?.lastName ?? "",
      org: managed?.org ?? "",
      emails: managed?.emails ?? [],
      phones: managed?.phones ?? [],
      contact_note: managed?.contactNote ?? "",
      cf_managed_hash: null,
      cf_synced_at: null,
      cf_sync_status: "dirty",
    };
    void hashManaged; void normalizePath; void stringifyYaml; // used in full impl
    void fm;
    throw new Error("TODO: create note file at contactsFolder/<name>.md with fm");
  }
}
