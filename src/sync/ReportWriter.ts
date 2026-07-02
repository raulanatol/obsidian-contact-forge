import { App } from "obsidian";
import type { ContactForgeSettings, SyncPlan } from "../core/types";

/**
 * Renders a SyncPlan to the report note. Each actionable row gets clickable
 * links using the obsidian://contact-forge protocol handled in main.ts.
 *
 * Row action link shape:
 *   obsidian://contact-forge?action=adopt&cardId=...
 *   obsidian://contact-forge?action=overwrite&uid=...
 *   obsidian://contact-forge?action=pull&uid=...&cardId=...
 *   obsidian://contact-forge?action=confirm&uid=...&cardId=...
 *   obsidian://contact-forge?action=mark-delete&cardId=...
 *
 * IMPLEMENTATION NOTES for Claude Code:
 * - Summary line with plan.counts.
 * - One markdown section + table per actionable bucket
 *   (dirty/created, edited-in-mac, orphan-mac, suggestion, error).
 * - Overwrite the report note each run at settings.reportPath.
 */
export class ReportWriter {
  constructor(private app: App, private settings: ContactForgeSettings) {}

  async write(_plan: SyncPlan): Promise<void> {
    void this.app; void this.settings;
    throw new Error("TODO: render plan -> markdown at settings.reportPath");
  }
}
