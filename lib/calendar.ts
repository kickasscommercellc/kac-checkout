import type { Display } from "./order";

/** Lokale tijd (Bonaire/Curaçao/SXM = UTC-4, geen zomertijd) → UTC-stempel voor agenda's. */
const TZ_OFFSET_MIN = Number(process.env.VENDOR_UTC_OFFSET_MIN ?? -240);

function stamp(ms: number) {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function eventTimes(d: Display) {
  const [h, m] = (d.startTime || "09:00").split(":").map(Number);
  const startUtc = Date.UTC(+d.date.slice(0, 4), +d.date.slice(5, 7) - 1, +d.date.slice(8, 10), h || 0, m || 0) - TZ_OFFSET_MIN * 60000;
  const endUtc = startUtc + (d.durationMin || 120) * 60000;
  return { start: stamp(startUtc), end: stamp(endUtc) };
}

export function placeText(d: Display) {
  return [d.meeting?.name, d.meeting?.address].filter(Boolean).join(", ");
}

export function googleCalendarUrl(d: Display, code: string) {
  const { start, end } = eventTimes(d);
  const p = new URLSearchParams({ action: "TEMPLATE", text: d.title, dates: `${start}/${end}`, details: `Booking reference: ${code}`, location: placeText(d) });
  return `https://calendar.google.com/calendar/render?${p}`;
}

export function directionsUrl(d: Display) {
  const m = d.meeting;
  if (!m) return null;
  const q = m.lat != null && m.lng != null ? `${m.lat},${m.lng}` : placeText(d);
  return q ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}` : null;
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/[,;]/g, (c) => "\\" + c).replace(/\n/g, "\\n");

export function icsFile(d: Display, code: string) {
  const { start, end } = eventTimes(d);
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Kick Ass Commerce//Checkout//EN", "BEGIN:VEVENT",
    `UID:${code}@kickasscommerce.com`, `DTSTAMP:${stamp(Date.now())}`, `DTSTART:${start}`, `DTEND:${end}`,
    `SUMMARY:${esc(d.title)}`, `DESCRIPTION:${esc("Booking reference: " + code)}`, `LOCATION:${esc(placeText(d))}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}
