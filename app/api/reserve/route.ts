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
    phone: z.string().min(6), // Bókun vereist een geldig telefoonnummer (bijv. +31612345678)
  }),
  travelDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

async function handle(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { method, booking, customer, travelDate } = parsed.data;

  // Tweede slot: Bókun dwingt het Distribution Filter NIET af via de API (getest 23-11-2026).
  // Daarom staan per aanbieder alleen expliciet toegestane producten toe.
  const allowed = new Set(env("ALLOWED_ACTIVITY_IDS").split(",").map((s) => Number(s.trim())));
  if (!booking.activityBookings?.length || booking.activityBookings.some((a) => !allowed.has(Number(a.activityId)))) {
    return NextResponse.json({ error: "Product niet toegestaan voor deze aanbieder" }, { status: 403 });
  }

  // Hoofdcontact altijd vanuit de gevalideerde klantgegevens opbouwen.
  booking.mainContactDetails = [
    { questionId: "firstName", values: [customer.firstname] },
    { questionId: "lastName", values: [customer.surname] },
    { questionId: "email", values: [customer.email] },
    { questionId: "phoneNumber", values: [customer.phone] },
  ];

  // Kaart = TMT in channel-valuta (bijv. USD). iDEAL/wallets via AxcessMS: iDEAL kan alleen EUR.
  const provider = method === "card" ? "tmt" : "axcess";
  const currency = provider === "tmt" ? env("TMT_CURRENCY") : "EUR";

  const { confirmationCode, raw } = await reserveForExternalPayment(booking, 0, currency);

  try {
    // Totaalbedrag uit de Bókun-reservering (veld totalPrice, geverifieerd 23-11-2026).
    const b = raw?.booking ?? raw;
    const amount = Number(b?.totalPrice);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Geen totaalbedrag in Bókun-response");
    // Bókun valt terug op de standaardvaluta als de gevraagde valuta niet op het channel staat.
    if (b?.currency && b.currency !== currency) throw new Error(`Bókun gaf ${b.currency} i.p.v. ${currency}: zet ${currency} aan op het booking channel`);

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
        tmt: tmtModalConfig({ totalCents, reference: confirmationCode, date: travelDate, firstname: customer.firstname, surname: customer.surname, email: customer.email, country: customer.country }),
      });
    }

    const { checkoutId } = await createCheckout({ amount, currency, merchantTransactionId: confirmationCode });
    // Tijdelijke diagnose (alleen bij ?debug=1): wat Bókun van de activiteit-boeking heeft gemaakt.
    const debug = new URL(req.url).searchParams.get("debug") === "1"
      ? { sent: booking.activityBookings, bokunActivityBooking: (b?.activityBookings || [])[0] }
      : undefined;
    return NextResponse.json({
      provider,
      order,
      amount,
      currency,
      debug,
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
