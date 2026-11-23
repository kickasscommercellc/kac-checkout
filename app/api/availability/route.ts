import { NextResponse } from "next/server";
import { env } from "../../../lib/env";
import { getActivity, getAvailability } from "../../../lib/bokun";

/** Product + beschikbaarheid (komende 30 dagen) voor een toegestaan product. */
export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("activityId"));
  const allowed = new Set(env("ALLOWED_ACTIVITY_IDS").split(",").map((s) => Number(s.trim())));
  if (!allowed.has(id)) return NextResponse.json({ error: "Product niet toegestaan" }, { status: 403 });
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const [activity, slots] = await Promise.all([
    getActivity(id),
    getAvailability(id, ymd(new Date(Date.now() + 864e5)), ymd(new Date(Date.now() + 31 * 864e5))),
  ]);
  const a = activity as any;
  // Tijdelijk: ruwe structuur tonen om prijsvelden te bepalen (alleen toegestane Demo-producten, geen geheime data).
  if (new URL(req.url).searchParams.get("raw") === "1") {
    const cur = new URL(req.url).searchParams.get("currency") || "USD";
    const eur = cur === "EUR" ? await getAvailability(id, ymd(new Date(Date.now() + 864e5)), ymd(new Date(Date.now() + 3 * 864e5)), "EUR") : null;
    return NextResponse.json({ activityKeys: Object.keys(a), pricingCategories: a.pricingCategories, rates: a.rates, bookableExtras: a.bookableExtras, slot: (slots as any[])[0], eurSlot: eur && (eur as any[])[0] });
  }
  return NextResponse.json({
    id,
    title: a.title,
    rates: (a.rates || []).map((r: any) => ({ id: r.id, title: r.title })),
    pricingCategories: (a.pricingCategories || []).map((c: any) => ({ id: c.id, title: c.title })),
    slots: (slots as any[])
      .filter((s) => !s.soldOut)
      .slice(0, 30)
      .map((s) => ({ date: ymd(new Date(s.date)), startTime: s.startTime, startTimeId: s.startTimeId, rateId: s.rates?.[0]?.id })),
  });
}
