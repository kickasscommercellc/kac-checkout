import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/**
 * Repayd / Trust My Travel Payment Modal.
 * authstring = SHA256( SHA256("channels&currencies&total&timestamp") + channelSecret ) + timestamp
 * timestamp = GMT "YmdHis"; total in centen; geldig 15 min.
 * Bron: developer.trustmy.group/payment-modal
 */

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

export function tmtTimestamp(d = new Date()): string {
  return d.toISOString().replace(/[-:T]/g, "").slice(0, 14); // YYYYmmddHHMMSS (UTC)
}

export function tmtAuthString(
  p: { channels: string; currencies: string; totalCents: number },
  secret: string,
  timestamp = tmtTimestamp(),
): string {
  const a = sha256([p.channels, p.currencies, p.totalCents, timestamp].join("&"));
  return sha256(a + secret) + timestamp;
}

/** Controleer het hash-veld dat TMT terugstuurt bij transaction_logged / transaction_failed. */
export function tmtVerifyTransaction(
  t: { id: string | number; status: string; total: string | number; hash: string },
  secret: string,
): boolean {
  const expected = sha256(sha256([t.id, t.status, t.total].join("&")) + secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(t.hash));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Config voor de modal in de browser. Bevat GEEN secret. Geen transactionType => purchase/sale (geen authorize). */
export function tmtModalConfig(p: {
  totalCents: number;
  reference: string;
  date: string;
  firstname: string;
  surname: string;
  email: string;
  country: string;
}) {
  const channels = env("TMT_CHANNEL_ID");
  const currencies = env("TMT_CURRENCY");
  return {
    path: env("TMT_SITE_PATH"),
    environment: env("TMT_ENVIRONMENT"),
    data: {
      booking_id: "0",
      booking_auth: tmtAuthString({ channels, currencies, totalCents: p.totalCents }, env("TMT_CHANNEL_SECRET")),
      channels,
      currencies,
      total: p.totalCents,
      reference: p.reference,
      date: p.date,
      country: p.country,
      firstname: p.firstname,
      surname: p.surname,
      email: p.email,
      payee_name: `${p.firstname} ${p.surname}`,
      payee_email: p.email,
      payee_country: p.country,
    },
  };
}
