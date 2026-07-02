import { Plugin } from 'obsidian';

import { ContactForgeSettings, DEFAULT_SETTINGS } from '../core/types';

export async function loadSettings(plugin: Plugin): Promise<ContactForgeSettings> {
  const data = (await plugin.loadData()) as Partial<ContactForgeSettings> | null;
  return Object.assign({}, DEFAULT_SETTINGS, data ?? {});
}

export async function saveSettings(plugin: Plugin, settings: ContactForgeSettings): Promise<void> {
  await plugin.saveData(settings);
}
