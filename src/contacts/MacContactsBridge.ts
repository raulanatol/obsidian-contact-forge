import type { LabeledValue, MacCard, ManagedFields } from '../core/types';

// JXA sources are bundled as text (esbuild loader ".js" -> "text").
import dumpGroupSrc from './jxa/dumpGroup.js';
import stampMarkerSrc from './jxa/stampMarker.js';
import upsertCardSrc from './jxa/upsertCard.js';
import { classifyOsascriptError } from './permissions';

interface ExecFileError extends Error {
  stdout?: string;
  stderr?: string;
}

/**
 * Bridge to macOS Contacts via `osascript -l JavaScript`.
 *
 * Data is never string-concatenated into the script body: the JXA source is
 * written verbatim to a temp file and the payload travels as a single JSON
 * argv argument, read back inside the script via `argv[0]`.
 */
export class MacContactsBridge {
  private async run(script: string, payload: unknown): Promise<unknown> {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const fs = await import('fs/promises');
    const os = await import('os');
    const path = await import('path');
    const { randomUUID } = await import('crypto');

    const execFileAsync = promisify(execFile);
    const tmpFile = path.join(os.tmpdir(), `contact-forge-${randomUUID()}.js`);
    await fs.writeFile(tmpFile, script, 'utf8');

    try {
      const { stdout } = await execFileAsync('osascript', ['-l', 'JavaScript', tmpFile, JSON.stringify(payload)]);
      try {
        return JSON.parse(stdout);
      } catch {
        throw new Error(`Unexpected osascript output: ${stdout.trim()}`);
      }
    } catch (e) {
      const err = e as ExecFileError;
      if (err.stderr !== undefined) {
        throw new Error(classifyOsascriptError(err.stderr));
      }
      throw err;
    } finally {
      await fs.unlink(tmpFile).catch(() => {});
    }
  }

  async dumpGroup(groupName: string): Promise<MacCard[]> {
    const out = await this.run(dumpGroupSrc, { group: groupName });
    return out as MacCard[];
  }

  async upsertCard(card: {
    id: string | null;
    managed: ManagedFields;
    group: string;
    noteBlock: string; // deep link + marker to append/replace
  }): Promise<{ id: string }> {
    const out = await this.run(upsertCardSrc, card);
    return out as { id: string };
  }

  async stampMarker(id: string, uid: string, noteBlock: string): Promise<void> {
    await this.run(stampMarkerSrc, { id, uid, noteBlock });
  }

  async testAccess(groupName: string): Promise<{ ok: boolean; message: string }> {
    try {
      await this.dumpGroup(groupName);
      return { ok: true, message: 'Contacts access OK' };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  }
}

// helper kept here for the bridge's mapping code
export function toLabeled(v: string | LabeledValue): LabeledValue {
  return typeof v === 'string' ? { label: 'other', value: v } : v;
}
