import type { Plugin } from 'obsidian';

const DESTRUCTIVE_ACTIONS = new Set(['mark-delete']);

/** Renders obsidian://contact-forge links in the report note as styled buttons. */
export function registerReportPostProcessor(plugin: Plugin): void {
  plugin.registerMarkdownPostProcessor(el => {
    el.querySelectorAll('a').forEach(a => {
      const href = a.getAttribute('href') ?? '';
      if (!href.startsWith('obsidian://contact-forge')) return;

      a.classList.add('contact-forge-action');
      try {
        const action = new URL(href).searchParams.get('action');
        if (action && DESTRUCTIVE_ACTIONS.has(action)) {
          a.classList.add('is-destructive');
        }
      } catch {
        // Malformed URL: still styled as a generic action button.
      }
    });
  });
}
