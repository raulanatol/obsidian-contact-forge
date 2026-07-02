import { App } from "obsidian";
import type { ContactForgeSettings } from "../core/types";

/**
 * Handlers for report action links (invoked by the protocol handler in main.ts).
 * All of these are user-initiated, per-row decisions.
 */
export class Actions {
  constructor(private app: App, private settings: ContactForgeSettings) {}

  // orphan-mac -> create a CN from the card, generate UUID, stamp marker, cache id.
  async adopt(_cardId: string): Promise<void> {
    throw new Error("TODO: adopt orphan card into a new contact note");
  }

  // orphan-mac -> append to a 'To delete in Mac' checklist; plugin never deletes.
  async markForDeletion(_cardId: string): Promise<void> {
    throw new Error("TODO: append card to deletion checklist in the report");
  }

  // edited-in-mac -> push Obsidian values over the card (treat as dirty).
  async overwrite(_uid: string): Promise<void> {
    throw new Error("TODO: force push note managed fields to the card");
  }

  // edited-in-mac -> pull card's managed fields into the note, recompute hash.
  async pull(_uid: string, _cardId: string): Promise<void> {
    throw new Error("TODO: update note frontmatter from card, recompute hash");
  }

  // suggestion -> confirm the weak match: set ids + stamp marker on both sides.
  async confirm(_uid: string, _cardId: string): Promise<void> {
    throw new Error("TODO: link note<->card, persist ids/markers");
  }
}
