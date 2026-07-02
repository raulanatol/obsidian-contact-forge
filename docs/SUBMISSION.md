# Submitting to the Obsidian community plugin list

1. Ensure `manifest.json` is valid: unique `id` (`contact-forge`), `isDesktopOnly: true`,
   correct `minAppVersion`, and `version` equal to the git tag.
2. Tag a release; the GitHub Action attaches `main.js`, `manifest.json`, `styles.css`.
3. Fork `obsidianmd/obsidian-releases`, add an entry to `community-plugins.json`:
   ```json
   {
     "id": "contact-forge",
     "name": "Contact Forge",
     "author": "Raúl Antón Lora",
     "description": "Obsidian as source of truth for contacts; one-way sync to macOS Contacts.",
     "repo": "raulanatol/obsidian-contact-forge"
   }
   ```
4. Open a PR and address the automated + reviewer checks. Common asks:
   - No `console.log` outside a debug gate (we use `src/core/log.ts`).
   - No private Obsidian APIs.
   - `fundingUrl` optional.
   - Clear README disclosure of macOS-only + Automation permission + overwrite behavior.
