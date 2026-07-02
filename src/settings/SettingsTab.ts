import { App, PluginSettingTab, Setting } from "obsidian";
import type ContactForgePlugin from "../main";

export class ContactForgeSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: ContactForgePlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;

    new Setting(containerEl)
      .setName("Contacts folder")
      .setDesc("Folder in the vault that holds one note per contact.")
      .addText((t) =>
        t.setValue(s.contactsFolder).onChange(async (v) => {
          s.contactsFolder = v.trim() || "Contacts";
          await this.plugin.persist();
        })
      );

    new Setting(containerEl)
      .setName("Source group (macOS Contacts)")
      .setDesc(
        "Name of the Contacts group treated as the synced set. Created cards join " +
          "this group; only this group is scanned for orphans."
      )
      .addText((t) =>
        t.setValue(s.sourceGroupName).onChange(async (v) => {
          s.sourceGroupName = v.trim() || "Obsidian";
          await this.plugin.persist();
        })
      );

    new Setting(containerEl)
      .setName("Report path")
      .addText((t) =>
        t.setValue(s.reportPath).onChange(async (v) => {
          s.reportPath = v.trim() || "Contact Forge Sync Report.md";
          await this.plugin.persist();
        })
      );

    new Setting(containerEl)
      .setName("Dry run")
      .setDesc("Compute the plan and report but never write to Contacts.")
      .addToggle((tg) =>
        tg.setValue(s.dryRun).onChange(async (v) => {
          s.dryRun = v;
          await this.plugin.persist();
        })
      );

    new Setting(containerEl)
      .setName("Confirm before writing")
      .addToggle((tg) =>
        tg.setValue(s.confirmBeforeWrite).onChange(async (v) => {
          s.confirmBeforeWrite = v;
          await this.plugin.persist();
        })
      );

    new Setting(containerEl)
      .setName("Debug logging")
      .addToggle((tg) =>
        tg.setValue(s.debug).onChange(async (v) => {
          s.debug = v;
          await this.plugin.persist();
        })
      );

    // TODO (Claude Code): per-field managed toggles + deepLinkVaultName override.
  }
}
