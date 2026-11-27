import { readDocs } from "../../../lib/order";
import { bokunPdf } from "../../../lib/bokun";

/** Ticket- of factuur-PDF van Bókun doorgeven aan de klant (Bókun-sleutels blijven op de server). */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const docs = readDocs(u.searchParams.get("d") ?? "");
  if (!docs) return new Response("Not found", { status: 404 });
  const kind = u.searchParams.get("kind") === "invoice" ? "invoice" : "ticket";
  const path = kind === "invoice" ? docs.invoice : docs.tickets[Number(u.searchParams.get("i") ?? 0)];
  if (!path) return new Response("Not found", { status: 404 });
  const pdf = await bokunPdf(path);
  if (!pdf) return new Response("Document not available yet, please check your email.", { status: 502 });
  return new Response(pdf.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${kind}-${docs.code}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
