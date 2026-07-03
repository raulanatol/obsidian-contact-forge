# Submitting to the Obsidian community plugin list

Submission is no longer a pull request to `community-plugins.json` — Obsidian moved this
to a web form. See [the official guide](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin)
for the authoritative steps; summary as of this writing:

1. Ensure `manifest.json` is valid: unique `id` (`contact-forge`), `isDesktopOnly: true`,
   correct `minAppVersion`, and `version` equal to the git tag. The directory reads
   `manifest.json` from the HEAD of the default branch, so commit it before submitting.
2. Tag a release; the GitHub Action attaches `main.js`, `manifest.json`, `styles.css`
   with the tag matching the manifest version.
3. Repo must be public, with a `README.md` and a `LICENSE`.
4. Go to [community.obsidian.md](https://community.obsidian.md), link your GitHub
   account, then **Plugins → New plugin**, paste the repo URL, accept the developer
   policies, and submit.

Common review asks (unchanged from the old process):
- No `console.log` outside a debug gate (we use `src/core/log.ts`).
- No private Obsidian APIs.
- Clear README disclosure of macOS-only + Automation permission + overwrite behavior.
