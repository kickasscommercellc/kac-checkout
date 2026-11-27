import { NextResponse } from "next/server";
import { getPaymentStatus, classifyResultCode } from "../../../../lib/axcess";
import { readToken } from "../../../../lib/order";
import { baseUrl } from "../../../../lib/baseurl";

type Ups = { ref: string; code: string; items: { id: string; qty: number }[]; label: string; amount: number; currency: string; exp: number };

/** Terugkomst na de upsell-betaling: status zelf opvragen, dan terug naar de bevestigingspagina. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = url.searchParams.get("back") ?? "";
  const safeBack = back.startsWith("/checkout/done?") ? back.replace(/&(added|addfail)=[^&]*/g, "") : "/checkout/done?status=success";
  const go = (extra: string) => NextResponse.redirect(`${baseUrl(req)}${safeBack}${extra}`);

  const u = readToken<Ups>(url.searchParams.get("u") ?? "", "upsell");
  const checkoutId = url.searchParams.get("id");
  if (!u || !checkoutId || Date.now() > u.exp) return go("&addfail=1");

  const payment = await getPaymentStatus(checkoutId);
  const outcome = classifyResultCode(payment?.result?.code ?? "");
  if (outcome === "failed" || outcome === "pending") return go("&addfail=1");
  if (Number(payment.amount) !== u.amount || payment.currency !== u.currency) {
    console.error("UPSELL BEDRAG WIJKT AF", { u, amount: payment.amount, currency: payment.currency });
    return go("&addfail=1");
  }
  // TODO Medusa: bestelling aanmaken (gekoppeld aan boeking u.code), voorraad bijwerken, bon mailen.
  console.log("UPSELL BETAALD", { booking: u.code, ref: u.ref, items: u.items, amount: u.amount, currency: u.currency, axcess: payment.id });
  return go(`&added=${encodeURIComponent(u.items.map((i) => `${i.id}:${i.qty}`).join(","))}`);
}
