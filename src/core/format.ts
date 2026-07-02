// Small display-formatting helpers shared by the report and the row actions.

/** "First Last", trimmed; falls back to a placeholder when both are empty. */
export function fullName(c: { firstName: string; lastName: string }): string {
  return `${c.firstName} ${c.lastName}`.trim() || "(unnamed)";
}
