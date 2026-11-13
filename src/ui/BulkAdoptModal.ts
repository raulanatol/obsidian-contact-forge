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
    contentEl.createEl('h2', { text: 'Import contacts from Mac' });
    contentEl.createEl('p', {
      text:
        `This creates ${this.count} new contact note${this.count === 1 ? '' : 's'} in Obsidian, ` +
        'one per Mac contact with no matching note. Contact data in Contacts.app is not changed, ' +
        'but a link back to its note is added to each contact’s note field. The import can only ' +
        'run once per vault (it can be resumed if some contacts fail), and there is no bulk undo.'
    });

    const buttons = contentEl.createDiv({ cls: 'modal-button-container' });
    const confirmBtn = buttons.createEl('button', { text: 'Import all', cls: 'mod-cta' });
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
