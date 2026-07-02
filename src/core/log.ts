import { Notice } from 'obsidian';

let debugEnabled = false;
export function setDebug(v: boolean): void {
  debugEnabled = v;
}

export const log = {
  info(msg: string): void {
    if (debugEnabled) console.log(`[contact-forge] ${msg}`);
  },
  warn(msg: string): void {
    console.warn(`[contact-forge] ${msg}`);
  },
  error(msg: string, err?: unknown): void {
    console.error(`[contact-forge] ${msg}`, err ?? '');
  },
  notice(msg: string): void {
    new Notice(`Contact Forge: ${msg}`);
  }
};
