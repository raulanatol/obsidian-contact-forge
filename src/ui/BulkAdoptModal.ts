import { App, Modal } from 'obsidian';

/** Pre-write confirmation for the bulk-adopt-orphans command. Resolves true on confirm. */
export class BulkAdoptModal extends Modal {
  private resolver: ((ok: boolean) => void) | null = null;
  constructor(
    app: App,
    private count: number
  ) {
    super(app);
  }
  openAndWait(): Promise<boolean> {
    return new Promise(resolve => {
      this.resolver = resolve;
      this.open();
    });
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Bulk adopt orphan contacts' });
    contentEl.createEl('p', {
      text:
        `This creates ${this.count} new contact note${this.count === 1 ? '' : 's'} in Obsidian, ` +
        'one per Mac contact with no matching note. It does not touch Contacts.app, and there is ' +
        'no bulk undo — review the created notes and delete any you don’t want.'
    });

    const buttons = contentEl.createDiv({ cls: 'modal-button-container' });
    const confirmBtn = buttons.createEl('button', { text: 'Adopt all', cls: 'mod-cta' });
    confirmBtn.addEventListener('click', () => {
      this.resolver?.(true);
      this.resolver = null;
      this.close();
    });
    const cancelBtn = buttons.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());
  }
  onClose(): void {
    this.contentEl.empty();
    this.resolver?.(false);
    this.resolver = null;
  }
}
