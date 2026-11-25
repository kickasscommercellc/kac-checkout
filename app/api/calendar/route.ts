import { readOrderForDisplay } from "../../../lib/order";
import { icsFile } from "../../../lib/calendar";

/** .ics-download voor Apple Agenda / Outlook. Alleen met een geldig ondertekend token. */
export async function GET(req: Request) {
  const o = readOrderForDisplay(new URL(req.url).searchParams.get("t") ?? "");
  if (!o?.d) return new Response("Not found", { status: 404 });
  return new Response(icsFile(o.d, o.confirmationCode), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="booking-${o.confirmationCode}.ics"` },
  });
}
