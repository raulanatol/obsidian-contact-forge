import { App, Modal } from "obsidian";
import type { SyncPlan } from "../core/types";

/** Pre-write confirmation summarizing the plan counts. Resolves true on confirm. */
export class ConfirmModal extends Modal {
  private resolver: ((ok: boolean) => void) | null = null;
  constructor(app: App, private plan: SyncPlan) {
    super(app);
  }
  openAndWait(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolver = resolve;
      this.open();
    });
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Sync contacts to Mac" });

    const list = contentEl.createEl("ul");
    for (const [kind, count] of Object.entries(this.plan.counts)) {
      list.createEl("li", { text: `${kind}: ${count}` });
    }
    if (Object.keys(this.plan.counts).length === 0) {
      contentEl.createEl("p", { text: "Nothing to sync." });
    }

    const buttons = contentEl.createDiv({ cls: "modal-button-container" });
    const confirmBtn = buttons.createEl("button", { text: "Confirm", cls: "mod-cta" });
    confirmBtn.addEventListener("click", () => {
      this.resolver?.(true);
      this.resolver = null;
      this.close();
    });
    const cancelBtn = buttons.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());
  }
  onClose(): void {
    this.contentEl.empty();
    this.resolver?.(false);
    this.resolver = null;
  }
}
