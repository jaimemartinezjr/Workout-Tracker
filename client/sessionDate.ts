export function formatSessionDate(date: string): string {
  const parsed = new Date(`${date.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;

  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(parsed);
  const calendarDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);

  return `${weekday} - ${calendarDate}`;
}
