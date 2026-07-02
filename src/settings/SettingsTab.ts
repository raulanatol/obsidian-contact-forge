import { App, PluginSettingTab, Setting } from 'obsidian';

import type { ContactForgeSettings } from '../core/types';
import type ContactForgePlugin from '../main';

export class ContactForgeSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: ContactForgePlugin
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;

    new Setting(containerEl)
      .setName('Contacts folder')
      .setDesc('Folder in the vault that holds one note per contact.')
      .addText(t =>
        t.setValue(s.contactsFolder).onChange(async v => {
          s.contactsFolder = v.trim() || 'Contacts';
          await this.plugin.persist();
        })
      );

    new Setting(containerEl)
      .setName('Group notes by initial')
      .setDesc(
        'File new contact notes into a subfolder named after the first letter of ' +
          'the slug, e.g. Contacts/j/jane-smith.md.'
      )
      .addToggle(tg =>
        tg.setValue(s.groupByInitial).onChange(async v => {
          s.groupByInitial = v;
          await this.plugin.persist();
        })
      );

    new Setting(containerEl)
      .setName('Source group (macOS Contacts)')
      .setDesc(
        'Name of the Contacts group treated as the synced set. Created cards join ' +
          'this group; only this group is scanned for orphans.'
      )
      .addText(t =>
        t.setValue(s.sourceGroupName).onChange(async v => {
          s.sourceGroupName = v.trim() || 'Obsidian';
          await this.plugin.persist();
        })
      );

    new Setting(containerEl).setName('Report path').addText(t =>
      t.setValue(s.reportPath).onChange(async v => {
        s.reportPath = v.trim() || 'Contact Forge Sync Report.md';
        await this.plugin.persist();
      })
    );

    new Setting(containerEl)
      .setName('Dry run')
      .setDesc('Compute the plan and report but never write to Contacts.')
      .addToggle(tg =>
        tg.setValue(s.dryRun).onChange(async v => {
          s.dryRun = v;
          await this.plugin.persist();
        })
      );

    new Setting(containerEl).setName('Confirm before writing').addToggle(tg =>
      tg.setValue(s.confirmBeforeWrite).onChange(async v => {
        s.confirmBeforeWrite = v;
        await this.plugin.persist();
      })
    );

    new Setting(containerEl).setName('Debug logging').addToggle(tg =>
      tg.setValue(s.debug).onChange(async v => {
        s.debug = v;
        await this.plugin.persist();
      })
    );

    containerEl.createEl('h3', { text: 'Managed fields' });

    const managedFieldToggle = (key: keyof ContactForgeSettings['managedFields'], name: string) => {
      new Setting(containerEl).setName(name).addToggle(tg =>
        tg.setValue(s.managedFields[key]).onChange(async v => {
          s.managedFields[key] = v;
          await this.plugin.persist();
        })
      );
    };

    managedFieldToggle('name', 'Sync name');
    managedFieldToggle('org', 'Sync organization');
    managedFieldToggle('emails', 'Sync emails');
    managedFieldToggle('phones', 'Sync phones');
    managedFieldToggle('contactNote', 'Sync contact note');

    new Setting(containerEl)
      .setName('Deep link vault name')
      .setDesc(
        'Overrides the vault name used in obsidian:// deep links stamped on Mac ' +
          'cards. Leave blank to auto-detect from the current vault.'
      )
      .addText(t =>
        t.setValue(s.deepLinkVaultName ?? '').onChange(async v => {
          s.deepLinkVaultName = v.trim() || null;
          await this.plugin.persist();
        })
      );
  }
}
