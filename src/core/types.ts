// Central type definitions for Contact Forge.
// Keep this file free of Obsidian/Node imports so it can be used by pure modules.

export interface LabeledValue {
  label: string; // e.g. "home" | "work" | "mobile" | "other"
  value: string;
}

export type SyncStatus =
  | "in-sync"
  | "dirty" // note changed in Obsidian, needs push
  | "orphan-mac" // card in source group with no matching note
  | "edited-in-mac" // card diverged from last-written managed fields
  | "suggestion" // weak heuristic match, needs user confirmation
  | "error";

/** The managed subset of fields that Obsidian owns and pushes to Mac. */
export interface ManagedFields {
  firstName: string;
  lastName: string;
  org: string;
  emails: LabeledValue[];
  phones: LabeledValue[];
  contactNote: string;
}

/** A contact note parsed from the vault (source of truth). */
export interface ContactNote {
  path: string; // vault-relative path
  obsidianUid: string; // UUID, immutable
  macContactId: string | null; // cached Contacts identifier
  managed: ManagedFields;
  managedHash: string | null; // cf_managed_hash from frontmatter
  syncedAt: string | null;
  syncEnabled: boolean; // per-note opt-out (cf_sync: false)
}

/** A card read back from macOS Contacts via JXA. */
export interface MacCard {
  id: string; // Contacts identifier
  firstName: string;
  lastName: string;
  org: string;
  emails: LabeledValue[];
  phones: LabeledValue[];
  note: string; // full note field (may contain the cf-uid marker)
  cfUid: string | null; // parsed from the note marker, if present
}

export type Bucket =
  | { kind: "in-sync"; note: ContactNote; card: MacCard }
  | { kind: "dirty"; note: ContactNote; card: MacCard | null }
  | { kind: "orphan-mac"; card: MacCard }
  | { kind: "edited-in-mac"; note: ContactNote; card: MacCard }
  | { kind: "suggestion"; note: ContactNote; card: MacCard }
  | { kind: "error"; note?: ContactNote; card?: MacCard; message: string };

export interface SyncPlan {
  buckets: Bucket[];
  toCreate: ContactNote[]; // notes with no card
  toUpdate: { note: ContactNote; card: MacCard }[];
  counts: Record<string, number>;
}

export interface ContactForgeSettings {
  contactsFolder: string;
  sourceGroupName: string;
  reportPath: string;
  deepLinkVaultName: string | null; // null => auto-detect
  managedFields: {
    name: boolean;
    org: boolean;
    emails: boolean;
    phones: boolean;
    contactNote: boolean;
  };
  dryRun: boolean;
  confirmBeforeWrite: boolean;
  debug: boolean;
}

export const DEFAULT_SETTINGS: ContactForgeSettings = {
  contactsFolder: "Contacts",
  sourceGroupName: "Obsidian",
  reportPath: "Contact Forge Sync Report.md",
  deepLinkVaultName: null,
  managedFields: {
    name: true,
    org: true,
    emails: true,
    phones: true,
    contactNote: true,
  },
  dryRun: false,
  confirmBeforeWrite: true,
  debug: false,
};
