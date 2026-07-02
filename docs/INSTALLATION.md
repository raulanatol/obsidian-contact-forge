# Installation

## Requirements

- macOS (the plugin controls Contacts.app via `osascript`).
- Obsidian desktop 1.5.0+.

## Manual install

1. Download `main.js`, `manifest.json`, `styles.css` from the latest release.
2. Create `<vault>/.obsidian/plugins/contact-forge/` and drop the three files in.
3. Enable **Contact Forge** in Settings → Community plugins.

## From source

```bash
git clone https://github.com/raulanatol/obsidian-contact-forge
cd obsidian-contact-forge
pnpm install
pnpm run build
# copy main.js, manifest.json, styles.css into your vault's plugin folder
```

## Grant Contacts permission

On first sync macOS asks whether Obsidian may control Contacts. If you miss the prompt:
System Settings → Privacy & Security → Automation → Obsidian → enable **Contacts**.
Run **Contact Forge: Test Contacts access** to re-trigger it.

## First-run recommendation

1. Create a Contacts group (e.g. `Obsidian`) and set its name in plugin settings.
2. Turn on **Dry run**, run **Sync contacts to Mac**, and read the report.
3. When happy, turn off dry run and sync for real.
