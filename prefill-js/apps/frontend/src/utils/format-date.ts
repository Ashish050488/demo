/** "2026-10-14T09:10:28Z" -> "14 Oct, 2:40 pm" in the viewer's locale. */
export function formatDateTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
