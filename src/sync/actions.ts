import { App, TFile, normalizePath } from 'obsidian';

import { MacContactsBridge } from '../contacts/MacContactsBridge';
import { fullName } from '../core/format';
import { hashManaged } from '../core/hash';
import { log } from '../core/log';
import type { ContactForgeSettings, MacCard, ManagedFields } from '../core/types';
import { macNoteBlock, stripMarkerBlock } from '../core/uid';

import { appendChecklistLine } from './deletionChecklist';
import { NoteRepository } from './NoteRepository';

function managedFromCard(card: MacCard): ManagedFields {
  return {
    firstName: card.firstName,
    lastName: card.lastName,
    org: card.org,
    emails: card.emails,
    phones: card.phones,
    contactNote: stripMarkerBlock(card.note)
  };
}

/**
 * Handlers for report action links (invoked by the protocol handler in main.ts)
 * plus bulkAdopt, the explicit opt-in batch version used by the
 * "Bulk adopt all orphan contacts" command. All are user-initiated.
 */
export class Actions {
  constructor(
    private app: App,
    private settings: ContactForgeSettings,
    private notes = new NoteRepository(app, settings),
    private bridge = new MacContactsBridge()
  ) {}

  // orphan-mac -> create a CN from the card, generate UUID, stamp marker, cache id.
  async adopt(cardId: string): Promise<void> {
    const card = await this.findCard(cardId);
    const file = await this.adoptCard(card);
    log.notice(`Adopted "${fullName(card)}" into ${file.path}`);
  }

  // Bulk version of adopt(): takes already-fetched cards (e.g. every orphan-mac
  // bucket from one SyncPlan) so it doesn't re-dump all of Contacts per card.
  // Per-card failures are collected rather than aborting the whole batch.
  async bulkAdopt(cards: MacCard[]): Promise<{ adopted: number; errors: { card: MacCard; message: string }[] }> {
    let adopted = 0;
    const errors: { card: MacCard; message: string }[] = [];
    for (const card of cards) {
      try {
        await this.adoptCard(card);
        adopted++;
      } catch (e) {
        errors.push({ card, message: (e as Error).message });
      }
    }
    return { adopted, errors };
  }

  private async adoptCard(card: MacCard): Promise<TFile> {
    const managed = managedFromCard(card);

    const { file, uid } = await this.notes.createFromTemplate(managed);
    const vaultName = this.settings.deepLinkVaultName ?? this.app.vault.getName();
    await this.bridge.stampMarker(card.id, uid, macNoteBlock(vaultName, uid));

    await this.notes.writeSyncState(file, {
      macContactId: card.id,
      managedHash: hashManaged(managed),
      syncedAt: new Date().toISOString(),
      status: 'in-sync'
    });

    return file;
  }

  // orphan-mac -> append to a 'To delete in Mac' checklist; plugin never deletes.
  async markForDeletion(cardId: string): Promise<void> {
    const card = await this.findCard(cardId);
    const path = normalizePath(this.settings.reportPath);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      throw new Error(`Sync report not found at "${path}". Run a sync first.`);
    }

    const content = await this.app.vault.read(file);
    await this.app.vault.modify(file, appendChecklistLine(content, card));
    log.notice(`Marked "${fullName(card)}" for deletion in Mac`);
  }

  // edited-in-mac -> push Obsidian values over the card (treat as dirty).
  async overwrite(uid: string): Promise<void> {
    const file = await this.findNoteFile(uid);
    const note = await this.notes.parse(file);
    if (!note.macContactId) {
      throw new Error(`Contact note ${file.path} has no cached mac_contact_id to push to.`);
    }

    const vaultName = this.settings.deepLinkVaultName ?? this.app.vault.getName();
    const { id } = await this.bridge.upsertCard({
      id: note.macContactId,
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

    log.notice(`Overwrote the Mac card from ${file.path}`);
  }

  // edited-in-mac -> pull card's managed fields into the note, recompute hash.
  async pull(uid: string, cardId: string): Promise<void> {
    const file = await this.findNoteFile(uid);
    const card = await this.findCard(cardId);
    const managed = managedFromCard(card);

    await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      fm.first_name = managed.firstName;
      fm.last_name = managed.lastName;
      fm.org = managed.org;
      fm.emails = managed.emails;
      fm.phones = managed.phones;
      fm.contact_note = managed.contactNote;
      fm.mac_contact_id = card.id;
      fm.cf_managed_hash = hashManaged(managed);
      fm.cf_synced_at = new Date().toISOString();
      fm.cf_sync_status = 'in-sync';
    });

    log.notice(`Pulled the Mac card into ${file.path}`);
  }

  // suggestion -> confirm the weak match: link ids + stamp the marker.
  async confirm(uid: string, cardId: string): Promise<void> {
    const file = await this.findNoteFile(uid);
    const card = await this.findCard(cardId);

    const vaultName = this.settings.deepLinkVaultName ?? this.app.vault.getName();
    await this.bridge.stampMarker(card.id, uid, macNoteBlock(vaultName, uid));
    await this.notes.writeSyncState(file, { macContactId: card.id });

    log.notice(`Linked ${file.path} to "${fullName(card)}"`);
  }

  private async findCard(cardId: string): Promise<MacCard> {
    const cards = await this.bridge.dumpGroup(this.settings.syncAllContacts ? null : this.settings.sourceGroupName);
    const card = cards.find(c => c.id === cardId);
    if (!card) {
      const scope = this.settings.syncAllContacts ? 'Contacts.app' : `group "${this.settings.sourceGroupName}"`;
      throw new Error(`Card ${cardId} was not found in ${scope} — it may already have been deleted.`);
    }
    return card;
  }

  private async findNoteFile(uid: string): Promise<TFile> {
    for (const file of await this.notes.listContactFiles()) {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (fm?.obsidian_uid === uid) return file;
    }
    throw new Error(`No contact note found with obsidian_uid ${uid}`);
  }
}
