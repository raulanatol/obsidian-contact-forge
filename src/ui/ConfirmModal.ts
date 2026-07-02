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
    // TODO (Claude Code): render this.plan.counts + Confirm/Cancel buttons.
    void this.plan;
  }
  onClose(): void {
    this.resolver?.(false);
  }
}
