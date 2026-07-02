/**
 * Turn raw osascript stderr into actionable guidance. macOS returns error -1743
 * (or "Not authorized to send Apple events") when Automation permission is missing.
 */
export function classifyOsascriptError(stderr: string): string {
  const s = stderr || '';
  if (/-1743|not authorized|osascript is not allowed/i.test(s)) {
    return (
      'Obsidian is not allowed to control Contacts. Grant it in ' +
      'System Settings → Privacy & Security → Automation → Obsidian → Contacts, ' +
      'then run the sync again.'
    );
  }
  if (/-1728|can.?t get|invalid index/i.test(s)) {
    return 'The configured Contacts group was not found. Check the group name in settings.';
  }
  return s.trim() || 'Unknown osascript error.';
}
