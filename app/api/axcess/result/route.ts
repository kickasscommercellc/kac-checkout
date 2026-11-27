import { NextResponse } from "next/server";
import { confirmReserved, abortReserved, travelDocLinks } from "../../../../lib/bokun";
import { getPaymentStatus, classifyResultCode } from "../../../../lib/axcess";
import { decodeOrder, encodeDocs } from "../../../../lib/order";
import { baseUrl } from "../../../../lib/baseurl";

/**
 * shopperResultUrl: hier komt de klant terug na iDEAL / Apple Pay / Google Pay.
 * We vertrouwen de redirect niet: we vragen de status zelf op bij AxcessMS.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  let reason = "";
  let docs = "";
  const token = url.searchParams.get("order") ?? "";
  const done = (status: string, code?: string) =>
    NextResponse.redirect(
      `${baseUrl(req)}/checkout/done?status=${status}${code ? `&code=${encodeURIComponent(code)}&t=${encodeURIComponent(token)}` : ""}${docs ? `&docs=${encodeURIComponent(docs)}` : ""}${reason && !["success", "review"].includes(status) ? `&reason=${encodeURIComponent(reason)}` : ""}`,
    );

  let order;
  try {
    order = decodeOrder(url.searchParams.get("order") ?? "");
  } catch {
    return done("expired");
  }
  const checkoutId = url.searchParams.get("id");
  if (!checkoutId || order.provider !== "axcess") return done("error");

  const payment = await getPaymentStatus(checkoutId);
  const outcome = classifyResultCode(payment?.result?.code ?? "");
  const paramErrors = Array.isArray(payment?.result?.parameterErrors)
    ? " [" + payment.result.parameterErrors.map((e: any) => `${e.name}: ${e.message}`).join("; ") + "]"
    : "";
  reason = `${payment?.result?.code ?? "?"} ${payment?.result?.description ?? ""}${paramErrors}`.trim();
  console.log("AxcessMS resultaat", { checkoutId, outcome, reason, brand: payment?.paymentBrand, amount: payment?.amount, currency: payment?.currency });

  if (outcome === "pending") return done("pending", order.confirmationCode); // webhook rondt dit later af (fase d)
  if (outcome === "failed") {
    await abortReserved(order.confirmationCode).catch(() => {});
    return done("failed");
  }

  // Bedrag en valuta moeten exact overeenkomen met de Bókun-reservering.
  if (Number(payment.amount) !== order.amount || payment.currency !== order.currency) {
    console.error("BEDRAG WIJKT AF", { order, payment: { amount: payment.amount, currency: payment.currency } });
    return done("error");
  }

  try {
    const confirmed = await confirmReserved(order.confirmationCode, {
      amount: order.amount,
      currency: order.currency,
      transactionId: `AXC-${payment.id}`,
      cardBrand: payment.paymentBrand,
    });
    const links = travelDocLinks(confirmed);
    console.log("Bókun travelDocuments", { code: order.confirmationCode, keys: Object.keys((confirmed as any)?.travelDocuments ?? {}), links });
    if (links.tickets.length || links.invoice) docs = encodeDocs({ code: order.confirmationCode, ...links });
  } catch (err) {
    console.error("BETAALD MAAR NIET BEVESTIGD", { confirmationCode: order.confirmationCode, axcess: payment.id, err });
    return done("attention", order.confirmationCode);
  }
  return done(outcome === "review" ? "review" : "success", order.confirmationCode);
}
