import { env } from "./env";

/**
 * AxcessMS = Open Payment Platform (oppwa), integratie via COPYandPAY.
 * 1) server: POST /v1/checkouts  (paymentType=DB = direct afschrijven, geen PA/pre-auth)
 * 2) browser: paymentWidgets.js?checkoutId=... met brands "IDEAL APPLEPAY GOOGLEPAY"
 * 3) server: GET /v1/checkouts/{id}/payment?entityId=... om het resultaat te verifiëren
 */

async function oppFetch(method: "GET" | "POST", path: string, form?: Record<string, string>) {
  const res = await fetch(env("AXCESS_BASE_URL") + path, {
    method,
    headers: {
      Authorization: `Bearer ${env("AXCESS_ACCESS_TOKEN")}`,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
    cache: "no-store",
  });
  const json = (await res.json()) as any;
  return json;
}

export type OppCustomer = {
  firstname: string; surname: string; email: string; phone?: string; country: string; ip?: string | null;
  address?: { street: string; city: string; postcode: string; country: string };
};

export async function createCheckout(p: { amount: number; currency: string; merchantTransactionId: string; customer?: OppCustomer; method?: string }) {
  const form: Record<string, string> = {
    entityId: env("AXCESS_ENTITY_ID"),
    amount: p.amount.toFixed(2),
    currency: p.currency,
    paymentType: "DB",
    merchantTransactionId: p.merchantTransactionId,
  };
  // iDEAL in de testomgeving: testMode=EXTERNAL (advies AxcessMS, 23-11-2026). Nooit live.
  if (p.method === "ideal" && /test/.test(env("AXCESS_BASE_URL"))) form.testMode = "EXTERNAL";
  // Klant- en adresgegevens (ACI weigert kaartbetalingen zonder: 200.100.504).
  const c = p.customer;
  if (c) {
    form["customer.givenName"] = c.firstname;
    form["customer.surname"] = c.surname;
    form["customer.email"] = c.email;
    if (c.phone) form["customer.mobile"] = c.phone;
    if (c.ip) form["customer.ip"] = c.ip;
    form["billing.country"] = (c.address?.country || c.country).toUpperCase();
    if (c.address) {
      form["billing.street1"] = c.address.street;
      form["billing.city"] = c.address.city;
      form["billing.postcode"] = c.address.postcode;
    }
  }
  const json = await oppFetch("POST", "/v1/checkouts", form);
  if (!json?.id) throw new Error("AxcessMS checkout mislukt: " + JSON.stringify(json?.result ?? json));
  return { checkoutId: json.id as string };
}

export async function getPaymentStatus(checkoutId: string) {
  return oppFetch(
    "GET",
    `/v1/checkouts/${encodeURIComponent(checkoutId)}/payment?entityId=${encodeURIComponent(env("AXCESS_ENTITY_ID"))}`,
  );
}

/**
 * Result codes volgens OPP: 000.000.*, 000.100.1*, 000.[36]* = geslaagd;
 * 000.400.0*, 000.400.100 = geslaagd maar handmatig controleren. Alles anders = niet geslaagd.
 * 000.200.* = nog in behandeling (pending) — bijv. iDEAL waarvan de klant nog niet terug is.
 */
export function classifyResultCode(code: string): "success" | "review" | "pending" | "failed" {
  if (/^(000\.000\.|000\.100\.1|000\.[36])/.test(code)) return "success";
  if (/^(000\.400\.0[^3]|000\.400\.100)/.test(code)) return "review";
  if (/^(000\.200)/.test(code)) return "pending";
  return "failed";
}

export function widgetScriptUrl(checkoutId: string) {
  return `${env("AXCESS_BASE_URL")}/v1/paymentWidgets.js?checkoutId=${encodeURIComponent(checkoutId)}`;
}
