import { NextResponse } from "next/server";
import { abortReserved } from "../../../lib/bokun";
import { decodeOrder } from "../../../lib/order";

/** Klant breekt af of betaling mislukt: plek in Bókun vrijgeven. */
export async function POST(req: Request) {
  const { order: token, timeout } = (await req.json()) as { order: string; timeout?: boolean };
  const order = decodeOrder(token);
  await abortReserved(order.confirmationCode, Boolean(timeout));
  return NextResponse.json({ ok: true });
}
