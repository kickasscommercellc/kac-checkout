import { NextResponse } from "next/server";
import { env } from "../../../lib/env";
import { getActivity, getAvailability } from "../../../lib/bokun";

/**
 * Product + beschikbaarheid (komende 60 dagen) met prijzen per persoonscategorie in USD en EUR.
 * Alleen voor producten die deze aanbieder mag verkopen.
 */
type Price = Record<number, number>;

function pricesFor(slot: any, rateId: number): Price {
  const r = (slot?.pricesByRate || []).find((p: any) => p.activityRateId === rateId) || slot?.pricesByRate?.[0];
  const out: Price = {};
  for (const c of r?.pricePerCategoryUnit || []) out[c.id] = Number(c.amount?.amount ?? 0);
  return out;
}

function extraPricesFor(slot: any, rateId: number) {
  const r = (slot?.pricesByRate || []).find((p: any) => p.activityRateId === rateId) || slot?.pricesByRate?.[0];
  const out: Record<number, { perCategory: Record<number, number>; perUnit: number | null }> = {};
  for (const e of r?.extraPricePerCategoryUnit || []) {
    out[e.id] = { perCategory: Object.fromEntries((e.prices || []).map((p: any) => [p.id, Number(p.amount?.amount ?? 0)])), perUnit: null };
  }
  for (const e of r?.extraPricePerUnit || []) {
    out[e.id] = { ...(out[e.id] || { perCategory: {} }), perUnit: Number(e.amount?.amount ?? 0) };
  }
  return out;
}

export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("activityId"));
  const allowed = new Set(env("ALLOWED_ACTIVITY_IDS").split(",").map((s) => Number(s.trim())));
  if (!allowed.has(id)) return NextResponse.json({ error: "Product niet toegestaan" }, { status: 403 });
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const start = ymd(new Date(Date.now() + 864e5));
  const end = ymd(new Date(Date.now() + 61 * 864e5));
  try {
    const [activity, usd, eur] = await Promise.all([getActivity(id), getAvailability(id, start, end, "USD"), getAvailability(id, start, end, "EUR")]);
    const a = activity as any;
    const eurById = new Map((eur as any[]).map((s) => [s.id, s]));
    const rateId = a.defaultRateId || a.rates?.[0]?.id;
    const rate = (a.rates || []).find((r: any) => r.id === rateId) || a.rates?.[0];
    // Extra's uit Bókun: alleen die in het tarief zitten. OPTIONAL + PRICED_SEPARATELY = te kiezen, anders inbegrepen.
    const extras = (rate?.extraConfigs || [])
      .map((cfg: any) => {
        const e = (a.bookableExtras || []).find((x: any) => x.id === cfg.activityExtraId);
        if (!e) return null;
        const included = cfg.pricingType === "INCLUDED_IN_PRICE" || cfg.selectionType !== "OPTIONAL";
        return {
          id: e.id,
          title: String(e.title || "").trim(),
          information: e.information || "",
          perPerson: e.pricingType === "PER_PERSON" || cfg.pricedPerPerson === true,
          maxPerBooking: e.maxPerBooking || 0,
          included,
          required: cfg.selectionType === "MANDATORY",
        };
      })
      .filter(Boolean);
    return NextResponse.json({
      id,
      title: a.title,
      excerpt: a.excerpt,
      photo: a.keyPhoto?.derived?.find((d: any) => d.name === "large")?.url || a.keyPhoto?.originalUrl || null,
      durationText: a.durationText,
      cancellationPolicy: a.rates?.[0]?.cancellationPolicy?.title ?? null,
      rateId,
      extras,
      categories: (a.pricingCategories || []).filter((c: any) => !c.internalUseOnly).map((c: any) => ({ id: c.id, title: c.title, isDefault: !!c.defaultCategory })),
      slots: (usd as any[])
        .filter((s) => !s.soldOut && !s.unavailable)
        .map((s) => ({
          date: ymd(new Date(s.date)),
          startTime: s.startTime,
          startTimeId: s.startTimeId,
          available: s.unlimitedAvailability ? 99 : s.availabilityCount,
          prices: { USD: pricesFor(s, rateId), EUR: pricesFor(eurById.get(s.id), rateId) },
          extraPrices: { USD: extraPricesFor(s, rateId), EUR: extraPricesFor(eurById.get(s.id), rateId) },
        })),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Beschikbaarheid kon niet worden opgehaald" }, { status: 502 });
  }
}
