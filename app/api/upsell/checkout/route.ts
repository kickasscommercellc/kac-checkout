import { NextResponse } from "next/server";
import { z } from "zod";
import { createCheckout, widgetScriptUrl } from "../../../../lib/axcess";
import { readOrderForDisplay, signToken } from "../../../../lib/order";
import { priceUpsell } from "../../../../lib/upsell";
import { baseUrl } from "../../../../lib/baseurl";
import { env } from "../../../../lib/env";

/** Upsell na de boeking: betaling klaarzetten voor producten (zelfde betaalmethodes als de boeking). */
const Body = z.object({
  method: z.enum(["card", "ideal", "applepay", "googlepay"]),
  t: z.string().max(4000).optional(), // ondertekend order-token van de boeking
  demo: z.boolean().optional(),
  bundle: z.boolean().optional(),
  items: z.array(z.object({ id: z.string().max(60), qty: z.number().int() })).max(10).optional(),
  back: z.string().max(6000),
});

export async function POST(req: Request) {
  try {
    const b = Body.parse(await req.json());
    if (!b.back.startsWith("/checkout/done?")) return NextResponse.json({ error: "Bad return" }, { status: 400 });
    const order = b.t ? readOrderForDisplay(b.t) : null;
    if (!order && !b.demo) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    // Demo alleen tegen de testomgeving van AxcessMS, nooit live geld.
    if (!order && !/test/.test(env("AXCESS_BASE_URL"))) return NextResponse.json({ error: "Demo only in test mode" }, { status: 403 });
    const code = order?.confirmationCode ?? "DEMO";
    const d = order?.d;
    const { amount, currency, items, label } = priceUpsell({ bundle: b.bundle, items: b.items }, b.method);
    const ref = `UPS-${code}-${Date.now().toString(36)}`.slice(0, 64);
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
    const { checkoutId } = await createCheckout({
      amount, currency, merchantTransactionId: ref, method: b.method,
      customer: {
        firstname: d?.firstname || "Guest", surname: d?.surname || "Guest", email: d?.email || "info@kickasscommerce.com",
        phone: d?.phone, country: d?.country || "US", ip,
      },
    });
    const u = signToken({ ref, code, items, label, amount, currency, exp: Date.now() + 30 * 60 * 1000 }, "upsell");
    return NextResponse.json({
      amount, currency, label,
      scriptUrl: widgetScriptUrl(checkoutId),
      entityId: b.method === "googlepay" ? env("AXCESS_ENTITY_ID") : undefined,
      brands: ({ card: "VISA MASTER DISCOVER DINERS", ideal: "IDEAL_VA", applepay: "APPLEPAY", googlepay: "GOOGLEPAY" } as Record<string, string>)[b.method],
      shopperResultUrl: `${baseUrl(req)}/api/upsell/result?u=${encodeURIComponent(u)}&back=${encodeURIComponent(b.back)}`,
    });
  } catch (err) {
    console.error("upsell checkout", err);
    return NextResponse.json({ error: "Payment could not be started. Please try again." }, { status: 500 });
  }
}
