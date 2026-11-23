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

export async function createCheckout(p: { amount: number; currency: string; merchantTransactionId: string }) {
  const json = await oppFetch("POST", "/v1/checkouts", {
    entityId: env("AXCESS_ENTITY_ID"),
    amount: p.amount.toFixed(2),
    currency: p.currency,
    paymentType: "DB",
    merchantTransactionId: p.merchantTransactionId,
  });
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
