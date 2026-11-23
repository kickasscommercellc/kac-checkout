import { NextResponse } from "next/server";
import { confirmReserved, abortReserved } from "../../../../lib/bokun";
import { getPaymentStatus, classifyResultCode } from "../../../../lib/axcess";
import { decodeOrder } from "../../../../lib/order";
import { env } from "../../../../lib/env";

/**
 * shopperResultUrl: hier komt de klant terug na iDEAL / Apple Pay / Google Pay.
 * We vertrouwen de redirect niet: we vragen de status zelf op bij AxcessMS.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const done = (status: string, code?: string) =>
    NextResponse.redirect(`${env("APP_BASE_URL")}/checkout/done?status=${status}${code ? `&code=${code}` : ""}`);

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
    await confirmReserved(order.confirmationCode, {
      amount: order.amount,
      currency: order.currency,
      transactionId: `AXC-${payment.id}`,
      cardBrand: payment.paymentBrand,
    });
  } catch (err) {
    console.error("BETAALD MAAR NIET BEVESTIGD", { confirmationCode: order.confirmationCode, axcess: payment.id, err });
    return done("attention", order.confirmationCode);
  }
  return done(outcome === "review" ? "review" : "success", order.confirmationCode);
}
