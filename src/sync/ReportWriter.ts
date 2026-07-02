import { App, TFile, normalizePath } from "obsidian";
import type { Bucket, ContactForgeSettings, MacCard, SyncPlan } from "../core/types";
import { fullName } from "../core/format";
import { parseExistingChecklist, renderDeletionSection } from "./deletionChecklist";

function cell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function noteLink(path: string): string {
  return `[[${path.replace(/\.md$/, "")}]]`;
}

function cardLabel(card: MacCard): string {
  const email = card.emails[0]?.value;
  return email ? `${fullName(card)} (${email})` : fullName(card);
}

function actionLink(label: string, action: string, params: Record<string, string>): string {
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return `[${label}](obsidian://contact-forge?action=${action}&${qs})`;
}

/**
 * Renders a SyncPlan to the report note. Each actionable row gets clickable
 * links using the obsidian://contact-forge protocol handled in main.ts.
 * Overwrites the report note each run at settings.reportPath, but preserves
 * the "To delete in Mac" checklist entries the user has marked (see
 * ./deletionChecklist.ts) as long as the underlying card is still orphaned.
 */
export class ReportWriter {
  constructor(private app: App, private settings: ContactForgeSettings) {}

  async write(plan: SyncPlan): Promise<void> {
    const path = normalizePath(this.settings.reportPath);
    const existing = this.app.vault.getAbstractFileByPath(path);
    const previousContent = existing instanceof TFile ? await this.app.vault.read(existing) : "";

    const content = this.render(plan, previousContent);

    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(path, content);
    }
  }

  private render(plan: SyncPlan, previousContent: string): string {
    const lines: string[] = [];
    lines.push("# Contact Forge Sync Report");
    lines.push("");
    lines.push(`_Last synced: ${new Date().toISOString()}_`);
    lines.push("");
    lines.push("## Summary");
    lines.push("");
    const created = plan.buckets.filter((b) => b.kind === "dirty" && b.card === null).length;
    const updated = plan.buckets.filter((b) => b.kind === "dirty" && b.card !== null).length;
    lines.push(`- In sync: ${plan.counts["in-sync"] ?? 0}`);
    lines.push(`- Created: ${created}`);
    lines.push(`- Updated: ${updated}`);
    lines.push(`- Edited in Mac (needs a decision): ${plan.counts["edited-in-mac"] ?? 0}`);
    lines.push(`- Orphan cards in Mac (needs a decision): ${plan.counts["orphan-mac"] ?? 0}`);
    lines.push(`- Suggested matches (needs confirmation): ${plan.counts["suggestion"] ?? 0}`);
    lines.push(`- Errors: ${plan.counts["error"] ?? 0}`);
    lines.push("");

    this.renderCreatedOrUpdated(lines, plan);
    this.renderEditedInMac(lines, plan);
    this.renderOrphans(lines, plan, previousContent);
    this.renderSuggestions(lines, plan);
    this.renderErrors(lines, plan);

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  private renderCreatedOrUpdated(lines: string[], plan: SyncPlan): void {
    const rows = plan.buckets.filter(
      (b): b is Extract<Bucket, { kind: "dirty" }> => b.kind === "dirty"
    );
    if (rows.length === 0) return;

    lines.push("## Created / updated this run");
    lines.push("");
    lines.push("| Contact | Status |");
    lines.push("| --- | --- |");
    for (const b of rows) {
      lines.push(`| ${noteLink(b.note.path)} | ${b.card ? "Updated" : "Created"} |`);
    }
    lines.push("");
  }

  private renderEditedInMac(lines: string[], plan: SyncPlan): void {
    const rows = plan.buckets.filter(
      (b): b is Extract<Bucket, { kind: "edited-in-mac" }> => b.kind === "edited-in-mac"
    );
    if (rows.length === 0) return;

    lines.push("## Edited in Mac — needs a decision");
    lines.push("");
    lines.push(
      "_The Contacts card was edited directly on the Mac. Obsidian is the source of truth; pick a resolution:_"
    );
    lines.push("");
    lines.push("| Contact | Actions |");
    lines.push("| --- | --- |");
    for (const b of rows) {
      const actions = [
        actionLink("Overwrite from Obsidian", "overwrite", { uid: b.note.obsidianUid }),
        actionLink("Pull into Obsidian", "pull", { uid: b.note.obsidianUid, cardId: b.card.id }),
      ].join(" · ");
      lines.push(`| ${noteLink(b.note.path)} | ${actions} |`);
    }
    lines.push("");
  }

  private renderOrphans(lines: string[], plan: SyncPlan, previousContent: string): void {
    const rows = plan.buckets.filter(
      (b): b is Extract<Bucket, { kind: "orphan-mac" }> => b.kind === "orphan-mac"
    );
    if (rows.length === 0) return;

    lines.push("## Orphan cards in Mac — needs a decision");
    lines.push("");
    lines.push(
      "_These Contacts cards have no matching note. The plugin never deletes automatically._"
    );
    lines.push("");
    lines.push("| Card | Actions |");
    lines.push("| --- | --- |");
    for (const b of rows) {
      const actions = [
        actionLink("Adopt into Obsidian", "adopt", { cardId: b.card.id }),
        actionLink("Mark for deletion", "mark-delete", { cardId: b.card.id }),
      ].join(" · ");
      lines.push(
        `| <span class="contact-forge-status-orphan">${cell(cardLabel(b.card))}</span> | ${actions} |`
      );
    }
    lines.push("");

    const pendingCardIds = new Set(rows.map((b) => b.card.id));
    const previousChecklist = parseExistingChecklist(previousContent);
    const checklist = renderDeletionSection(pendingCardIds, previousChecklist);
    if (checklist.length > 0) {
      lines.push("## To delete in Mac");
      lines.push("");
      lines.push(
        "_Marked by you from the table above; the plugin never deletes automatically. " +
          "Delete the card in Contacts.app and the row disappears on the next sync._"
      );
      lines.push("");
      lines.push(...checklist);
      lines.push("");
    }
  }

  private renderSuggestions(lines: string[], plan: SyncPlan): void {
    const rows = plan.buckets.filter(
      (b): b is Extract<Bucket, { kind: "suggestion" }> => b.kind === "suggestion"
    );
    if (rows.length === 0) return;

    lines.push("## Suggested matches — needs confirmation");
    lines.push("");
    lines.push(
      "_Same name and a shared email; never linked automatically. Ignore by doing nothing " +
        "— the row disappears once the note or card changes._"
    );
    lines.push("");
    lines.push("| Note | Card | Action |");
    lines.push("| --- | --- | --- |");
    for (const b of rows) {
      const action = actionLink("Confirm match", "confirm", {
        uid: b.note.obsidianUid,
        cardId: b.card.id,
      });
      lines.push(`| ${noteLink(b.note.path)} | ${cell(cardLabel(b.card))} | ${action} |`);
    }
    lines.push("");
  }

  private renderErrors(lines: string[], plan: SyncPlan): void {
    const rows = plan.buckets.filter(
      (b): b is Extract<Bucket, { kind: "error" }> => b.kind === "error"
    );
    if (rows.length === 0) return;

    lines.push("## Errors");
    lines.push("");
    lines.push("| Contact | Error |");
    lines.push("| --- | --- |");
    for (const b of rows) {
      const label = b.note ? noteLink(b.note.path) : b.card ? cardLabel(b.card) : "(unknown)";
      lines.push(
        `| ${cell(label)} | <span class="contact-forge-status-error">${cell(b.message)}</span> |`
      );
    }
    lines.push("");
  }
}
