import { createHmac } from "node:crypto";
import { env } from "./env";

/**
 * Bókun REST API client.
 * Auth: X-Bokun-Signature = Base64(HmacSHA1(secret, date + accessKey + METHOD + pathWithQuery))
 * Bron: bokun.dev > "Configuring the platform for API usage and authentication".
 */

export function bokunDate(d = new Date()): string {
  // "yyyy-MM-dd HH:mm:ss" in UTC
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export function bokunSignature(
  date: string,
  accessKey: string,
  method: string,
  pathWithQuery: string,
  secretKey: string,
): string {
  const toSign = date + accessKey + method.toUpperCase() + pathWithQuery;
  return createHmac("sha1", secretKey).update(toSign, "utf8").digest("base64");
}

export class BokunError extends Error {
  constructor(public status: number, public body: string) {
    super(`Bókun API ${status}: ${body.slice(0, 500)}`);
  }
}

async function bokunFetch<T>(method: "GET" | "POST", pathWithQuery: string, body?: unknown): Promise<T> {
  const accessKey = env("BOKUN_ACCESS_KEY");
  const date = bokunDate();
  const res = await fetch(env("BOKUN_BASE_URL") + pathWithQuery, {
    method,
    headers: {
      "X-Bokun-Date": date,
      "X-Bokun-AccessKey": accessKey,
      "X-Bokun-Signature": bokunSignature(date, accessKey, method, pathWithQuery, env("BOKUN_SECRET_KEY")),
      "Content-Type": "application/json;charset=UTF-8",
      Accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new BokunError(res.status, text);
  return (text ? JSON.parse(text) : {}) as T;
}

/**
 * Ticket/factuur-PDF ophalen. Bókun geeft in de confirm-response (travelDocuments) een downloadpad terug.
 * Alleen paden binnen Bókun worden opgehaald (geen willekeurige URL's).
 */
export async function bokunPdf(pathOrUrl: string): Promise<Response | null> {
  const base = new URL(env("BOKUN_BASE_URL"));
  let url: URL;
  try {
    url = new URL(pathOrUrl, base);
  } catch {
    return null;
  }
  const isBokunHost = url.host === base.host || /(^|\.)bokun\.(io|is)$/.test(url.hostname);
  if (url.protocol !== "https:" || !isBokunHost) return null;
  const headers: Record<string, string> = { Accept: "application/pdf" };
  if (url.host === base.host) {
    const accessKey = env("BOKUN_ACCESS_KEY");
    const date = bokunDate();
    const pq = url.pathname + url.search;
    headers["X-Bokun-Date"] = date;
    headers["X-Bokun-AccessKey"] = accessKey;
    headers["X-Bokun-Signature"] = bokunSignature(date, accessKey, "GET", pq, env("BOKUN_SECRET_KEY"));
  }
  const res = await fetch(url, { headers, cache: "no-store" });
  return res.ok ? res : null;
}

/** Downloadpaden voor ticket(s) en factuur uit een confirm/submit-response. */
export function travelDocLinks(resp: any): { tickets: string[]; invoice: string | null } {
  const td = resp?.travelDocuments ?? {};
  const tickets = (Array.isArray(td.activityTickets) ? td.activityTickets : [])
    .map((t: any) => t?.ticket)
    .filter((x: unknown): x is string => typeof x === "string" && x.length > 0);
  const inv = td.invoice;
  const invoice = typeof inv === "string" ? inv : inv?.invoice ?? inv?.pdf ?? inv?.link ?? inv?.url ?? null;
  return { tickets, invoice: typeof invoice === "string" ? invoice : null };
}

/**
 * BookingRequest zoals Bókun die verwacht (directBooking).
 * Velden volgens de REST v1 OpenAPI-spec; de exacte inhoud van passengers/answers
 * volgt uit de checkout options-response en wordt in fase 1 met de test-UI geverifieerd.
 */
export interface BookingRequest {
  mainContactDetails: { questionId: string; values: string[] }[];
  activityBookings: {
    activityId: number;
    rateId?: number;
    startTimeId?: number;
    date: string; // yyyy-MM-dd
    passengers?: unknown[];
    answers?: { questionId: string; values: string[] }[];
    [key: string]: unknown;
  }[];
  externalBookingReference?: string;
  promoCode?: string;
}

export function getActivity(id: number) {
  return bokunFetch<Record<string, unknown>>("GET", `/activity.json/${id}?currency=USD&lang=EN`);
}

export function getAvailability(id: number, start: string, end: string, currency = "USD") {
  return bokunFetch<unknown[]>("GET", `/activity.json/${id}/availabilities?start=${start}&end=${end}&currency=${currency}&lang=EN`);
}

/** Stap 0: welke checkout-opties/betaalmethodes zijn toegestaan + vragen die beantwoord moeten worden. */
export function getCheckoutOptions(request: BookingRequest, currency: string) {
  return bokunFetch<Record<string, unknown>>(
    "POST",
    `/checkout.json/options/booking-request?currency=${encodeURIComponent(currency)}`,
    request,
  );
}

/** Stap 1: reserveren voor externe betaling. Houdt de plek max. 30 minuten vast. */
export async function reserveForExternalPayment(request: BookingRequest, amount: number, currency: string) {
  const res = await bokunFetch<Record<string, any>>(
    "POST",
    `/checkout.json/submit?currency=${encodeURIComponent(currency)}`,
    {
      checkoutOption: "CUSTOMER_FULL_PAYMENT",
      paymentMethod: "RESERVE_FOR_EXTERNAL_PAYMENT",
      source: "DIRECT_REQUEST",
      directBooking: request,
      amount,
      currency,
      // Bókun lijkt de keuze bij het reserveren te onthouden; bij "false" kreeg de klant na bevestigen geen mail (23-11-2026).
      // Test: aan bij reserveren — controleren dat de mail pas ná betaling/bevestiging komt.
      sendNotificationToMainContact: true,
      showPricesInNotification: true,
    },
  );
  // De confirmation code staat in de booking van de checkout-response.
  const confirmationCode: string | undefined = res?.booking?.confirmationCode ?? res?.confirmationCode;
  if (!confirmationCode) throw new Error("Bókun gaf geen confirmation code terug: " + JSON.stringify(res).slice(0, 500));
  return { confirmationCode, raw: res };
}

/** Stap 3: bevestigen na een geverifieerde externe betaling. */
export function confirmReserved(
  confirmationCode: string,
  payment: { amount: number; currency: string; transactionId: string; cardBrand?: string; last4?: string },
) {
  return bokunFetch<Record<string, unknown>>(
    "POST",
    `/checkout.json/confirm-reserved/${encodeURIComponent(confirmationCode)}`,
    {
      amount: payment.amount,
      currency: payment.currency,
      sendNotificationToMainContact: true,
      showPricesInNotification: true,
      transactionDetails: {
        transactionDate: bokunDate(),
        transactionId: payment.transactionId,
        cardBrand: payment.cardBrand,
        last4: payment.last4,
      },
    },
  );
}

/** Vrijgeven bij mislukte/afgebroken betaling. GET geverifieerd tegen live Bókun op 23-11-2026. */
export function abortReserved(confirmationCode: string, timeout = false) {
  return bokunFetch<Record<string, unknown>>(
    "GET",
    `/booking.json/${encodeURIComponent(confirmationCode)}/abort-reserved?timeout=${timeout}`,
  );
}
