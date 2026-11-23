import { NextResponse } from "next/server";
import { z } from "zod";
import { reserveForExternalPayment, abortReserved, type BookingRequest } from "../../../lib/bokun";
import { tmtModalConfig } from "../../../lib/tmt";
import { createCheckout, widgetScriptUrl } from "../../../lib/axcess";
import { encodeOrder } from "../../../lib/order";
import { env } from "../../../lib/env";

/**
 * Stap 1 van de checkout: plek reserveren in Bókun (external payment) en de betaling klaarzetten.
 * Het bedrag komt ALTIJD uit Bókun, nooit uit de browser.
 */
const Body = z.object({
  method: z.enum(["card", "ideal", "applepay", "googlepay"]),
  booking: z.custom<BookingRequest>((v) => typeof v === "object" && v !== null),
  customer: z.object({
    firstname: z.string().min(1),
    surname: z.string().min(1),
    email: z.string().email(),
    country: z.string().length(2),
  }),
  travelDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { method, booking, customer, travelDate } = parsed.data;

  // Kaart = TMT in channel-valuta (bijv. USD). iDEAL/wallets via AxcessMS: iDEAL kan alleen EUR.
  const provider = method === "card" ? "tmt" : "axcess";
  const currency = provider === "tmt" ? env("TMT_CURRENCY") : "EUR";

  const { confirmationCode, raw } = await reserveForExternalPayment(booking, 0, currency);

  try {
    // Totaalbedrag uit de Bókun-reservering. (Veldnaam in fase 1 verifiëren met test-account.)
    const b = raw?.booking ?? raw;
    const amount = Number(b?.totalPrice ?? b?.totalDue ?? b?.totalPriceAmount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Geen totaalbedrag in Bókun-response");

    const order = encodeOrder({
      confirmationCode,
      amount,
      currency,
      provider,
      vendor: env("VENDOR_ID"),
      expiresAt: Date.now() + 28 * 60 * 1000, // marge onder Bókun's 30 min
    });

    if (provider === "tmt") {
      const totalCents = Math.round(amount * 100);
      return NextResponse.json({
        provider,
        order,
        amount,
        currency,
        tmt: tmtModalConfig({ totalCents, reference: confirmationCode, date: travelDate, ...customer }),
      });
    }

    const { checkoutId } = await createCheckout({ amount, currency, merchantTransactionId: confirmationCode });
    return NextResponse.json({
      provider,
      order,
      amount,
      currency,
      axcess: {
        checkoutId,
        scriptUrl: widgetScriptUrl(checkoutId),
        brands: ({ ideal: "IDEAL", applepay: "APPLEPAY", googlepay: "GOOGLEPAY" } as Record<string, string>)[method],
        shopperResultUrl: `${env("APP_BASE_URL")}/api/axcess/result?order=${encodeURIComponent(order)}`,
      },
    });
  } catch (err) {
    // Betaling kon niet klaargezet worden: plek direct weer vrijgeven.
    await abortReserved(confirmationCode).catch(() => {});
    throw err;
  }
}
