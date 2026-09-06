// SQL timestamps have a space separator; normalize it for mobile browsers.
// Old time-only checkpoints use their trip date when it is available.
export function activityDate(value, fallbackDate = "") {
  if (!value) return null;
  let input = String(value).trim();
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(input)) {
    if (!fallbackDate) return null;
    input = `${fallbackDate}T${input}`;
  }
  const date = new Date(input.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function activityClock(value, fallbackDate = "") {
  const date = activityDate(value, fallbackDate);
  return date ? date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase() : "—";
}

export function activityDay(value, fallbackDate = "") {
  const date = activityDate(value, fallbackDate);
  return date ? date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

export function activityInput(value, fallbackDate = "") {
  const date = activityDate(value, fallbackDate);
  if (!date) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function chronologicalLogs(rows, tripDate) {
  return [...rows].sort((left, right) => {
    const a = activityDate(left.recorded_at, tripDate)?.getTime() ?? Infinity;
    const b = activityDate(right.recorded_at, tripDate)?.getTime() ?? Infinity;
    return (a === b ? 0 : a < b ? -1 : 1) || Number(left.id) - Number(right.id);
  });
}
