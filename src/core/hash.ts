// Deterministic canonicalization + hashing of managed fields.
// Pure module: no external imports. Must yield identical hashes for identical
// content across runs and machines (idempotency depends on this).

import type { LabeledValue, ManagedFields } from "./types";

function normStr(s: string | undefined | null): string {
  return (s ?? "").trim();
}

function normList(list: LabeledValue[] | undefined): LabeledValue[] {
  return (list ?? [])
    .map((lv) => ({
      label: normStr(lv.label).toLowerCase() || "other",
      value: normStr(lv.value).toLowerCase(),
    }))
    .filter((lv) => lv.value.length > 0)
    .sort((a, b) =>
      a.value === b.value
        ? a.label.localeCompare(b.label)
        : a.value.localeCompare(b.value)
    );
}

/** Produce an order-stable, normalized view of the managed fields. */
export function canonicalize(m: ManagedFields): unknown {
  return {
    firstName: normStr(m.firstName),
    lastName: normStr(m.lastName),
    org: normStr(m.org),
    emails: normList(m.emails),
    phones: normList(m.phones),
    contactNote: normStr(m.contactNote),
  };
}

/** FNV-1a 32-bit hash over a UTF-8 string, returned as 8-char hex. */
export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply via shifts to stay in 32-bit range
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Stable hash of the managed fields. */
export function hashManaged(m: ManagedFields): string {
  return fnv1a(JSON.stringify(canonicalize(m)));
}
