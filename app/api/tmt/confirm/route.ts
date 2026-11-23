import { NextResponse } from "next/server";
import { confirmReserved, abortReserved } from "../../../../lib/bokun";
import { tmtVerifyTransaction } from "../../../../lib/tmt";
import { decodeOrder } from "../../../../lib/order";
import { env } from "../../../../lib/env";

/**
 * Na TMT-callback "transaction_logged": hash server-side controleren, bedrag controleren,
 * daarna pas de Bókun-reservering bevestigen.
 */
export async function POST(req: Request) {
  const { order: token, transaction } = (await req.json()) as {
    order: string;
    transaction: { id: string; status: string; total: number | string; hash: string; card_type?: string; last_four?: string };
  };
  const order = decodeOrder(token);
  if (order.provider !== "tmt") return NextResponse.json({ error: "Verkeerde provider" }, { status: 400 });

  if (!tmtVerifyTransaction(transaction, env("TMT_CHANNEL_SECRET"))) {
    return NextResponse.json({ error: "Ongeldige TMT-handtekening" }, { status: 400 });
  }
  if (Number(transaction.total) !== Math.round(order.amount * 100)) {
    return NextResponse.json({ error: "Bedrag komt niet overeen" }, { status: 400 });
  }
  // TODO fase 1: exacte TMT-statuswaarden voor geslaagd bevestigen in test-channel.
  if (!/^(complete|completed|success|successful|paid)$/i.test(transaction.status)) {
    await abortReserved(order.confirmationCode).catch(() => {});
    return NextResponse.json({ ok: false, status: transaction.status });
  }

  try {
    await confirmReserved(order.confirmationCode, {
      amount: order.amount,
      currency: order.currency,
      transactionId: `TMT-${transaction.id}`,
      cardBrand: transaction.card_type,
      last4: transaction.last_four,
    });
  } catch (err) {
    // Betaald maar niet bevestigd: dit moet handmatig opgevolgd worden (fase d: alert + auto-refund).
    console.error("BETAALD MAAR NIET BEVESTIGD", { confirmationCode: order.confirmationCode, tmt: transaction.id, err });
    return NextResponse.json({ ok: false, needsAttention: true }, { status: 502 });
  }
  return NextResponse.json({ ok: true, confirmationCode: order.confirmationCode });
}
