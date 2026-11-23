import { describe, it, expect, beforeAll } from "vitest";
import { createHash } from "node:crypto";
import { bokunSignature, bokunDate } from "../lib/bokun";
import { tmtAuthString, tmtVerifyTransaction, tmtTimestamp } from "../lib/tmt";
import { classifyResultCode } from "../lib/axcess";
import { encodeOrder, decodeOrder } from "../lib/order";

describe("Bókun signature", () => {
  it("klopt met het voorbeeld uit de officiële Bókun-documentatie", () => {
    const sig = bokunSignature(
      "2013-11-09 14:33:46",
      "de235a6a15c340b6b1e1cb5f3687d04a",
      "POST",
      "/activity.json/search?lang=EN&currency=ISK",
      "23e2c7da7f7048e5b46f96bc91324800",
    );
    expect(sig).toBe("XrOiTYa9Y34zscnLCsAEh8ieoyo=");
  });
  it("datumformaat yyyy-MM-dd HH:mm:ss (UTC)", () => {
    expect(bokunDate(new Date(Date.UTC(2026, 10, 23, 9, 5, 7)))).toBe("2026-11-23 09:05:07");
  });
});

describe("TMT", () => {
  const sha = (s: string) => createHash("sha256").update(s).digest("hex");
  it("timestamp YmdHis GMT", () => {
    expect(tmtTimestamp(new Date(Date.UTC(2019, 7, 12, 5, 52, 13)))).toBe("20190812055213");
  });
  it("authstring = sha256(sha256(base)+secret)+timestamp", () => {
    const ts = "20190812055213";
    const s = tmtAuthString({ channels: "2", currencies: "USD", totalCents: 1000 }, "secret", ts);
    expect(s).toBe(sha(sha("2&USD&1000&" + ts) + "secret") + ts);
  });
  it("verifieert transactie-hash en weigert gemanipuleerde data", () => {
    const hash = sha(sha("123&complete&1000") + "secret");
    expect(tmtVerifyTransaction({ id: "123", status: "complete", total: 1000, hash }, "secret")).toBe(true);
    expect(tmtVerifyTransaction({ id: "123", status: "complete", total: 1, hash }, "secret")).toBe(false);
  });
});

describe("AxcessMS result codes", () => {
  it("classificeert", () => {
    expect(classifyResultCode("000.000.000")).toBe("success");
    expect(classifyResultCode("000.100.110")).toBe("success");
    expect(classifyResultCode("000.200.000")).toBe("pending");
    expect(classifyResultCode("800.100.151")).toBe("failed");
  });
});

describe("Order-token", () => {
  beforeAll(() => {
    process.env.ORDER_SIGNING_SECRET = "test-secret";
  });
  const base = { confirmationCode: "ABC-1", amount: 125, currency: "USD", provider: "tmt" as const, vendor: "v" };
  it("round-trip", () => {
    const t = encodeOrder({ ...base, expiresAt: Date.now() + 60_000 });
    expect(decodeOrder(t).confirmationCode).toBe("ABC-1");
  });
  it("weigert aangepast bedrag", () => {
    const t = encodeOrder({ ...base, expiresAt: Date.now() + 60_000 });
    const [, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ ...base, amount: 1, expiresAt: Date.now() + 60_000 })).toString("base64url");
    expect(() => decodeOrder(`${forged}.${sig}`)).toThrow();
  });
  it("weigert verlopen reservering", () => {
    const t = encodeOrder({ ...base, expiresAt: Date.now() - 1 });
    expect(() => decodeOrder(t)).toThrow(/verlopen/);
  });
});
