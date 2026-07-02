import type { LabeledValue, MacCard, ManagedFields } from "../core/types";
import { classifyOsascriptError } from "./permissions";

// JXA sources are bundled as text (esbuild loader ".js" -> "text").
import dumpGroupSrc from "./jxa/dumpGroup.js";
import upsertCardSrc from "./jxa/upsertCard.js";
import stampMarkerSrc from "./jxa/stampMarker.js";

/**
 * Bridge to macOS Contacts via `osascript -l JavaScript`.
 *
 * IMPLEMENTATION NOTES for Claude Code:
 * - Use child_process.execFile (promisified). Write the JXA source to a temp file
 *   and pass the JSON payload as a single argv argument; the JXA reads it via
 *   ObjC $.NSProcessInfo.processInfo.arguments. Return JSON on stdout.
 * - NEVER string-concatenate user data into the script body. Data goes only through
 *   the JSON argv/stdin channel.
 * - On non-zero exit or non-JSON stdout, throw an Error whose message is derived from
 *   classifyOsascriptError(stderr) so the UI can show TCC guidance.
 * - Import child_process/os/fs LAZILY inside methods (desktop-only).
 */
export class MacContactsBridge {
  private async run(_script: string, _payload: unknown): Promise<unknown> {
    // const { execFile } = await import("child_process");
    // ...write _script to tmp, execFile("osascript", ["-l","JavaScript", tmp, JSON.stringify(_payload)])
    void classifyOsascriptError;
    throw new Error("TODO: run osascript and parse JSON result");
  }

  async dumpGroup(groupName: string): Promise<MacCard[]> {
    const out = await this.run(dumpGroupSrc, { group: groupName });
    return out as MacCard[];
  }

  async upsertCard(
    card: {
      id: string | null;
      managed: ManagedFields;
      group: string;
      noteBlock: string; // deep link + marker to append/replace
    }
  ): Promise<{ id: string }> {
    const out = await this.run(upsertCardSrc, card);
    return out as { id: string };
  }

  async stampMarker(id: string, uid: string, noteBlock: string): Promise<void> {
    await this.run(stampMarkerSrc, { id, uid, noteBlock });
  }

  async testAccess(groupName: string): Promise<{ ok: boolean; message: string }> {
    try {
      await this.dumpGroup(groupName);
      return { ok: true, message: "Contacts access OK" };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  }
}

// helper kept here for the bridge's mapping code
export function toLabeled(v: string | LabeledValue): LabeledValue {
  return typeof v === "string" ? { label: "other", value: v } : v;
}
