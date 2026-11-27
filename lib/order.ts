import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/**
 * Een ondertekend "order-token" dat de browser meekrijgt tussen reserveren en betalen.
 * Daarmee kan niemand het bedrag of de boeking onderweg aanpassen.
 * (Fase d vervangt dit door een database met transactielog voor reconciliatie.)
 */
export interface Order {
  confirmationCode: string; // Bókun
  amount: number; // in hele valuta-eenheden, bijv. 125.00
  currency: string;
  provider: "tmt" | "axcess";
  vendor: string; // aanbieder, voor reconciliatie
  expiresAt: number; // ms; Bókun houdt de plek max. 30 min vast
  d?: Display; // alleen voor de bevestigingspagina
}

/** Weergavegegevens voor de bevestigingspagina (geen betaalgegevens). */
export interface Display {
  title: string;
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  pax?: number;
  durationMin?: number;
  meeting?: { name?: string; address?: string; lat?: number; lng?: number } | null;
  email?: string;
}

const sign = (data: string) => createHmac("sha256", env("ORDER_SIGNING_SECRET")).update(data).digest("base64url");

export function encodeOrder(o: Order): string {
  const data = Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${data}.${sign(data)}`;
}

/** Voor de bevestigingspagina: handtekening controleren, verlooptijd niet (klant kan later terugkomen). */
export function readOrderForDisplay(token: string): Order | null {
  try {
    const [data, sig] = token.split(".");
    if (!data || !sig) return null;
    const expected = Buffer.from(sign(data));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    return JSON.parse(Buffer.from(data, "base64url").toString()) as Order;
  } catch {
    return null;
  }
}

export function decodeOrder(token: string): Order {
  const [data, sig] = token.split(".");
  if (!data || !sig) throw new Error("Ongeldig order-token");
  const expected = Buffer.from(sign(data));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new Error("Order-token is aangepast");
  const o = JSON.parse(Buffer.from(data, "base64url").toString()) as Order;
  if (Date.now() > o.expiresAt) throw new Error("Reservering verlopen");
  return o;
}

/** Ondertekend token met de downloadpaden van ticket(s) en factuur, voor de bevestigingspagina. */
export interface Docs { code: string; tickets: string[]; invoice: string | null }

export function encodeDocs(d: Docs): string {
  const data = Buffer.from(JSON.stringify(d)).toString("base64url");
  return `${data}.${sign("docs:" + data)}`;
}

export function readDocs(token: string): Docs | null {
  try {
    const [data, sig] = token.split(".");
    if (!data || !sig) return null;
    const expected = Buffer.from(sign("docs:" + data));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    return JSON.parse(Buffer.from(data, "base64url").toString()) as Docs;
  } catch {
    return null;
  }
}
