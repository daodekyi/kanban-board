/**
 * Pulls a leading position number out of a column title so it can be shown as
 * a badge. Accepts "1. To Do", "1) To Do" and plain "1 To Do" — people don't
 * reliably type the separator, and a column that looks numbered should get the
 * badge either way. Capped at two digits so a title like "2026 Roadmap" stays
 * a title.
 */
export function splitLeadingNumber(title: string): { number: string | null; rest: string } {
  const match = title.match(/^(\d{1,2})(?:[.)]\s*|\s+)(.*)$/);
  if (!match) return { number: null, rest: title };
  return { number: match[1], rest: match[2] };
}
