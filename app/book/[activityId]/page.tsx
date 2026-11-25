"use client";
import "../book.css";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

/**
 * Boekingsflow (eerste functionele versie, neutrale stijl):
 * 0 Kies  → 1 Gegevens → 2 Betalen → bevestiging (/checkout/done)
 * Prijzen en beschikbaarheid komen live uit Bókun; het te betalen bedrag komt bij reserveren uit Bókun.
 */
type ExtraPrice = Record<number, { perCategory: Record<number, number>; perUnit: number | null }>;
type Slot = { date: string; startTime: string; startTimeId: number; available: number; prices: { USD: Record<number, number>; EUR: Record<number, number> }; extraPrices: { USD: ExtraPrice; EUR: ExtraPrice } };
type Extra = { id: number; title: string; information: string; perPerson: boolean; maxPerBooking: number; included: boolean; required: boolean };
type Info = { visitorCountry?: string | null; id: number; title: string; excerpt?: string; photo: string | null; durationText?: string; cancellationPolicy: string | null; cancellationRules?: string[]; termsUrl?: string; privacyUrl?: string; rateId: number; extras: Extra[]; categories: { id: number; title: string; isDefault: boolean }[]; slots: Slot[] };
type Method = "ideal" | "googlepay" | "applepay" | "card";

const money = (n: number, cur: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(n);
const DOW = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export default function Book() {
  const { activityId } = useParams<{ activityId: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [step, setStep] = useState(0);
  const [month, setMonth] = useState<string>("");
  const [date, setDate] = useState("");
  const [slotId, setSlotId] = useState<number | null>(null);
  const [showPolicy, setShowPolicy] = useState(false);
  const [pax, setPax] = useState<Record<number, number>>({});
  const [extraQty, setExtraQty] = useState<Record<number, number>>({}); // per-persoon: 0/1 (voor alle deelnemers), per-boeking: aantal
  const [showExtras, setShowExtras] = useState(false);
  const [c, setC] = useState({ email: "", firstname: "", surname: "", phone: "", country: "NL", terms: false });
  const [touched, setTouched] = useState(false);
  const [method, setMethod] = useState<Method | null>(null);
  const [pay, setPay] = useState<{ scriptUrl: string; brands: string; shopperResultUrl: string; amount: number; currency: string; expiresAt: number; order: string; entityId?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [payErr, setPayErr] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    fetch(`/api/availability?activityId=${activityId}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j as Info; })
      .then((j) => {
        setInfo(j);
        if (j.visitorCountry) setC((x) => ({ ...x, country: String(j.visitorCountry).toUpperCase() }));
        const def = j.categories.find((x) => x.isDefault) ?? j.categories[0];
        if (def) setPax({ [def.id]: 1 });
        if (j.slots[0]) { const d0 = j.slots[0].date; const ds = j.slots.filter((s: Slot) => s.date === d0); setMonth(d0.slice(0, 7)); setDate(d0); setSlotId(ds.length === 1 ? ds[0].startTimeId : null); }
      })
      .catch((e) => setLoadErr(e.message || "Kon de activiteit niet laden"));
    try { const saved = JSON.parse(localStorage.getItem("kac_guest") || "null"); if (saved) setC((x) => ({ ...x, ...saved, terms: false })); } catch {}
  }, [activityId]);

  useEffect(() => { if (!pay) return; const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, [pay]);

  useEffect(() => {
    if (!pay) return;
    // Kaart: ACI eist een straat (100.800.100). Adres in hetzelfde formulier, minimaal verplicht: straat + land (vooringevuld).
    (window as any).wpwlOptions = method === "card"
      ? {
          style: "plain",
          brandDetection: true,
          brandDetectionType: "binlist",
          billingAddress: { country: (c.country || "").toUpperCase() },
          mandatoryBillingFields: { country: true, state: false, city: false, postcode: false, street1: true, street2: false },
          onReady: () => {
            // Hide billing fields we don't need: only street + country stay visible.
            ["billing.state", "billing.city", "billing.postcode", "billing.street2"].forEach((n) => {
              document.querySelectorAll(`[name="${n}"]`).forEach((el) => {
                // Alleen het eigen veld verbergen, niet de hele adresgroep (daar zitten straat + land ook in).
                // Alleen het invoerveld zelf verbergen; wrappers kunnen meerdere adresvelden bevatten.
                (el as HTMLElement).style.display = "none";
                const id = (el as HTMLElement).id;
                if (id) document.querySelectorAll(`label[for="${id}"]`).forEach((l) => ((l as HTMLElement).style.display = "none"));
              });
            });
          },
        }
      : method === "googlepay"
      ? {
          style: "plain",
          // Google Pay wordt volledig in ons verzoek geconfigureerd (bevestigd door AxcessMS 25-11-2026).
          // merchantId is pas nodig voor live (na goedkeuring door Google).
          googlePay: {
            gatewayMerchantId: pay.entityId,
            merchantName: "Kick Ass Commerce",
            allowedAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"],
            allowedCardNetworks: ["VISA", "MASTERCARD", "DISCOVER"],
          },
        }
      : { style: "plain" };
    const s = document.createElement("script");
    s.src = pay.scriptUrl; s.async = true;
    document.body.appendChild(s);
    return () => { s.remove(); };
  }, [pay]);

  const dates = useMemo(() => new Set(info?.slots.map((s) => s.date)), [info]);
  const daySlots = info?.slots.filter((s) => s.date === date) ?? [];
  const slot = daySlots.find((s) => s.startTimeId === slotId) ?? (daySlots.length === 1 ? daySlots[0] : undefined);
  const needTime = daySlots.length > 1 && !slot;
  const ps = slot ?? daySlots[0]; // prices for display before a time is chosen
  const paxCount = Object.values(pax).reduce((a, b) => a + b, 0);
  const lines = (cur: "USD" | "EUR") => (info?.categories ?? []).filter((cat) => pax[cat.id]).map((cat) => ({ title: cat.title, n: pax[cat.id], sum: (ps?.prices[cur][cat.id] ?? 0) * pax[cat.id] }));
  const extraLine = (e: Extra, cur: "USD" | "EUR") => {
    const p = ps?.extraPrices?.[cur]?.[e.id];
    if (e.perPerson) return Object.entries(pax).reduce((a, [cat, n]) => a + (p?.perCategory?.[Number(cat)] ?? p?.perUnit ?? 0) * n, 0);
    return (p?.perUnit ?? Object.values(p?.perCategory ?? {})[0] ?? 0) * (extraQty[e.id] || 0);
  };
  const extraUnitPrice = (e: Extra, cur: "USD" | "EUR") => {
    const p = ps?.extraPrices?.[cur]?.[e.id];
    const def = info?.categories.find((x) => x.isDefault)?.id ?? info?.categories[0]?.id ?? 0;
    return p?.perCategory?.[def] ?? p?.perUnit ?? 0;
  };
  const chosenExtras = (info?.extras ?? []).filter((e) => !e.included && (extraQty[e.id] || 0) > 0);
  const extraLines = (cur: "USD" | "EUR") => chosenExtras.map((e) => ({ title: e.title, n: e.perPerson ? paxCount : extraQty[e.id], sum: extraLine(e, cur) }));
  const total = (cur: "USD" | "EUR") => lines(cur).reduce((a, l) => a + l.sum, 0) + extraLines(cur).reduce((a, l) => a + l.sum, 0);
  const shownCur: "USD" | "EUR" = method === "ideal" || method === "googlepay" || method === "applepay" ? "EUR" : "USD";

  const emailOk = /^\S+@\S+\.\S+$/.test(c.email);
  const phoneOk = /^\+\d{7,15}$/.test(c.phone.replace(/[\s-]/g, ""));
  const detailsOk = emailOk && phoneOk && c.firstname.trim() && c.surname.trim() && c.terms;

  // Terug vanuit betalen: lopende reservering vrijgeven en betaalkeuze resetten.
  function goBack(to: number) {
    if (pay) { fetch("/api/abort", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: pay.order }) }).catch(() => {}); setPay(null); }
    setMethod(null); setPayErr(""); setStep(to);
  }

  async function startPayment(m: Method) {
    if (m === method) return; // kaart: straat + land zitten in het ACI-kaartformulier zelf; iDEAL: geen adres
    setMethod(m); setPayErr("");
    // Vorige reservering vrijgeven als de klant van betaalmethode wisselt.
    if (pay) { fetch("/api/abort", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: pay.order }) }).catch(() => {}); setPay(null); }

    if (!info || !slot) return;

    setBusy(true); setPay(null);
    try {
      // Extra's per deelnemer (Bókun: passengers[].extras met extraId + quantity — geverifieerd 23-11-2026;
      // het veld "unitCount" uit de OpenAPI-spec wordt door Bókun genegeerd). Per-boeking-extra's op de eerste deelnemer.
      const perPerson = chosenExtras.filter((e) => e.perPerson).map((e) => ({ extraId: e.id, quantity: 1 }));
      const perBooking = chosenExtras.filter((e) => !e.perPerson).map((e) => ({ extraId: e.id, quantity: extraQty[e.id] }));
      const passengers = Object.entries(pax)
        .flatMap(([id, n]) => Array.from({ length: n }, () => ({ pricingCategoryId: Number(id), extras: [...perPerson] as { extraId: number; quantity: number }[] })))
        .map((p, i) => (i === 0 ? { ...p, extras: [...p.extras, ...perBooking] } : p));
      const res = await fetch("/api/reserve", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: m, travelDate: slot.date,
          customer: {
            firstname: c.firstname.trim(), surname: c.surname.trim(), email: c.email.trim(), phone: c.phone.replace(/[\s-]/g, ""), country: (c.country || "NL").toUpperCase(),

          },
          booking: { mainContactDetails: [], activityBookings: [{ activityId: info.id, rateId: info.rateId, startTimeId: slot.startTimeId, date: slot.date, passengers }] },
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "Reserveren mislukt");
      setPay({ ...j.axcess, amount: j.amount, currency: j.currency, order: j.order, expiresAt: Date.now() + 28 * 60 * 1000 });
    } catch (e: any) {
      setPayErr(e.message || "Er ging iets mis. Probeer het opnieuw.");
    } finally { setBusy(false); }
  }

  if (loadErr) return <div className="kac"><div className="kac-wrap"><div className="kac-card kac-body">{loadErr}</div></div></div>;
  if (!info) return <div className="kac"><div className="kac-wrap"><div className="kac-card kac-body">Loading…</div></div></div>;

  // Kalender voor de gekozen maand
  const [y, mo] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, mo - 1, 1));
  const daysIn = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7;
  const months = [...new Set(info.slots.map((s) => s.date.slice(0, 7)))];
  const mIdx = months.indexOf(month);

  const Summary = (
    <aside className="kac-card">
      {info.photo && <img className="kac-photo" src={info.photo} alt="" />}
      <div className="kac-sum">
        <h3>{info.title}</h3>
        {slot && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{new Date(slot.date + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}, {slot.startTime} · {paxCount} {paxCount === 1 ? "person" : "people"}</span>
            {step > 0 && <button className="kac-link" onClick={() => goBack(0)} aria-label="Edit">✎</button>}
          </div>
        )}
        {lines(shownCur).map((l) => <div className="kac-line" key={l.title}><span>{l.n} × {l.title}</span><span>{money(l.sum, shownCur)}</span></div>)}
        {extraLines(shownCur).map((l) => <div className="kac-line" key={"x" + l.title}><span>{l.n} × {l.title}</span><span>{money(l.sum, shownCur)}</span></div>)}
        {(info.extras ?? []).filter((e) => e.included).map((e) => <div className="kac-line" key={"i" + e.id}><span>{e.title}</span><span>Included</span></div>)}
        <div className="kac-total"><span>Total</span><span>{money(pay ? pay.amount : total(shownCur), pay ? pay.currency : shownCur)}</span></div>
        {info.cancellationPolicy && <button type="button" className="kac-hint kac-a" style={{ marginTop: 8, textAlign: "left" }} onClick={() => setShowPolicy(true)}>{info.cancellationPolicy} · details</button>}
        {showPolicy && (
          <div className="kac-modal" role="dialog" aria-modal="true" onClick={() => setShowPolicy(false)}>
            <div className="kac-modal-box" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginTop: 0 }}>Cancellation policy</h3>
              {info.cancellationPolicy && <p><b>{info.cancellationPolicy}</b></p>}
              {(info.cancellationRules ?? []).length > 0
                ? <ul>{info.cancellationRules!.map((r) => <li key={r}>{r}</li>)}</ul>
                : <p>See the product description and your booking confirmation for details.</p>}
              <p className="kac-hint">Your booking is with the activity provider. Full terms: <a className="kac-a" href={info.termsUrl} target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</a></p>
              <button type="button" className="kac-btn" onClick={() => setShowPolicy(false)}>Close</button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );

  const Steps = (
    <div className="kac-steps">
      {["Details", "Payment", "Confirmed"].map((t, i) => (
        <div key={t} className={"kac-step" + (step === i + 1 ? " on" : step > i + 1 ? " done" : "")}><b>{i + 1}</b>{t}</div>
      ))}
    </div>
  );

  return (
    <div className="kac">
      <div className="kac-wrap">
        <section className="kac-card">
          {step === 0 && (
            <>
              <div className="kac-head"><h1>Book an activity</h1></div>
              <div className="kac-body">
                <div style={{ fontSize: 14, color: "var(--muted)" }}>Total for {paxCount} {paxCount === 1 ? "person" : "people"}</div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>{money(total("USD"), "USD")}</div>

                <span className="kac-label">People</span>
                {info.categories.map((cat) => (
                  <div className="kac-pax" key={cat.id}>
                    <div>{cat.title}<small>{money(ps?.prices.USD[cat.id] ?? 0, "USD")} per person</small></div>
                    <div className="kac-stepper">
                      <button aria-label={`Fewer ${cat.title}`} disabled={!pax[cat.id]} onClick={() => setPax({ ...pax, [cat.id]: Math.max(0, (pax[cat.id] || 0) - 1) })}>−</button>
                      <span>{pax[cat.id] || 0}</span>
                      <button aria-label={`More ${cat.title}`} disabled={!!slot && paxCount >= slot.available} onClick={() => setPax({ ...pax, [cat.id]: (pax[cat.id] || 0) + 1 })}>+</button>
                    </div>
                  </div>
                ))}

                <div className="kac-cal-nav">
                  <button disabled={mIdx <= 0} onClick={() => setMonth(months[mIdx - 1])} aria-label="Previous month">‹</button>
                  <span>{first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</span>
                  <button disabled={mIdx >= months.length - 1} onClick={() => setMonth(months[mIdx + 1])} aria-label="Next month">›</button>
                </div>
                <div className="kac-cal">
                  {DOW.map((d) => <div className="dow" key={d}>{d}</div>)}
                  {Array.from({ length: offset }, (_, i) => <div key={"e" + i} />)}
                  {Array.from({ length: daysIn }, (_, i) => {
                    const d = `${month}-${String(i + 1).padStart(2, "0")}`;
                    const av = dates.has(d);
                    return <button key={d} disabled={!av} className={"kac-day" + (av ? " av" : "") + (d === date ? " sel" : "")} onClick={() => { const ds = info.slots.filter((s) => s.date === d); setDate(d); setSlotId(ds.length === 1 ? ds[0].startTimeId : null); }}>{i + 1}</button>;
                  })}
                </div>

                {daySlots.length > 0 && (
                  <>
                    <span className="kac-label">{new Date(date + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · {daySlots.length > 1 ? "choose a time" : "start time"}</span>
                    <div className="kac-times">
                      {daySlots.map((s) => <button key={s.startTimeId} className={"kac-time" + (s.startTimeId === slot?.startTimeId ? " sel" : "")} onClick={() => setSlotId(s.startTimeId)}>{s.startTimeId === slot?.startTimeId ? "✓ " : ""}{s.startTime}</button>)}
                    </div>
                    {slot && slot.available <= 5 && <p className="kac-hint">Only {slot.available} spots left</p>}
                  </>
                )}
                <button className="kac-btn" disabled={!slot || paxCount === 0} onClick={() => setStep(1)}>{needTime ? "Choose a time" : `Book now · ${money(total("USD"), "USD")}`}</button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="kac-head"><button className="kac-back" aria-label="Back" onClick={() => setStep(0)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button><h2>Your details</h2></div>
              <div className="kac-body">
                {Steps}
                <label className="kac-label" htmlFor="em">Email</label>
                <input id="em" className="kac-input" type="email" autoComplete="email" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} />
                {touched && !emailOk && <div className="kac-err">Please enter a valid email address</div>}
                <div className="kac-row">
                  <div><label className="kac-label" htmlFor="fn">First name</label><input id="fn" className="kac-input" autoComplete="given-name" value={c.firstname} onChange={(e) => setC({ ...c, firstname: e.target.value })} /></div>
                  <div><label className="kac-label" htmlFor="ln">Last name</label><input id="ln" className="kac-input" autoComplete="family-name" value={c.surname} onChange={(e) => setC({ ...c, surname: e.target.value })} /></div>
                </div>
                {touched && (!c.firstname.trim() || !c.surname.trim()) && <div className="kac-err">Please enter your name</div>}
                <label className="kac-label" htmlFor="ph">Phone (with country code)</label>
                <input id="ph" className="kac-input" type="tel" autoComplete="tel" placeholder="+31 6 12345678" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} />
                {touched && !phoneOk && <div className="kac-err">Please enter your phone number including country code, e.g. +31…</div>}
                {(info.extras ?? []).some((e) => !e.included) && (
                  <div className="kac-pm" style={{ marginTop: 18 }}>
                    <button className="kac-pm-h" onClick={() => setShowExtras(!showExtras)}>
                      <span>Add extras <span className="kac-pm-off">({(info.extras ?? []).filter((e) => !e.included).length})</span></span>
                      <span>{showExtras ? "▾" : "›"}</span>
                    </button>
                    {showExtras && (
                      <div className="kac-pm-b">
                        {(info.extras ?? []).filter((e) => !e.included).map((e) => (
                          <div className="kac-pax" key={e.id}>
                            <div>{e.title}<small>+{money(extraUnitPrice(e, "USD"), "USD")} {e.perPerson ? "per person" : "each"}</small>{e.information && <small>{e.information}</small>}</div>
                            {e.perPerson ? (
                              <input type="checkbox" aria-label={`Add ${e.title}`} style={{ width: 22, height: 22 }} checked={(extraQty[e.id] || 0) > 0} onChange={(ev) => setExtraQty({ ...extraQty, [e.id]: ev.target.checked ? 1 : 0 })} />
                            ) : (
                              <div className="kac-stepper">
                                <button aria-label={`Fewer ${e.title}`} disabled={!extraQty[e.id]} onClick={() => setExtraQty({ ...extraQty, [e.id]: Math.max(0, (extraQty[e.id] || 0) - 1) })}>−</button>
                                <span>{extraQty[e.id] || 0}</span>
                                <button aria-label={`More ${e.title}`} disabled={!!e.maxPerBooking && (extraQty[e.id] || 0) >= e.maxPerBooking} onClick={() => setExtraQty({ ...extraQty, [e.id]: (extraQty[e.id] || 0) + 1 })}>+</button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <label style={{ display: "flex", gap: 10, marginTop: 18, alignItems: "flex-start" }}>
                  <input type="checkbox" checked={c.terms} onChange={(e) => setC({ ...c, terms: e.target.checked })} style={{ width: 20, height: 20 }} />
                  <span>I agree to the <a href={info.termsUrl} target="_blank" rel="noopener noreferrer" className="kac-a">terms</a>, the <button type="button" className="kac-a" onClick={(e) => { e.preventDefault(); setShowPolicy(true); }}>cancellation policy</button> and the <a href={info.privacyUrl} target="_blank" rel="noopener noreferrer" className="kac-a">privacy statement</a>.</span>
                </label>
                {touched && !c.terms && <div className="kac-err">Please accept the terms</div>}
                <button className="kac-btn" onClick={() => {
                  setTouched(true);
                  if (!detailsOk) return;
                  try { localStorage.setItem("kac_guest", JSON.stringify({ email: c.email, firstname: c.firstname, surname: c.surname, phone: c.phone, country: c.country })); } catch {}
                  setStep(2);
                }}>Continue</button>
                <button className="kac-link" style={{ marginTop: 14 }} onClick={() => setStep(0)}>‹ Back</button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="kac-head"><button className="kac-back" aria-label="Back" onClick={() => goBack(1)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button><h2>Choose how to pay</h2></div>
              <div className="kac-body">
                {Steps}
                {([
                  ["ideal", "iDEAL | Wero", "Pay in EUR with your Dutch bank app"],
                  ["googlepay", "Google Pay", ""],
                  ["applepay", "Apple Pay", "Available in Safari on Apple devices"],
                  ["card", "Cards · Visa, Mastercard, Discover, Diners", ""],
                ] as [Method, string, string][]).map(([m, label, sub]) => (
                  <div key={m} className={"kac-pm" + (method === m ? " open" : "")}>
                    <button className="kac-pm-h" onClick={() => !busy && startPayment(m)} disabled={busy}>
                      <span>{label}{sub && <span className="kac-pm-off" style={{ display: "block", fontWeight: 400 }}>{sub}</span>}</span>
                      <span>{method === m ? "▾" : "›"}</span>
                    </button>
                    {method === m && (
                      <div className="kac-pm-b">
                        {busy && <p className="kac-pm-off">Reserving your spot…</p>}
                        {payErr && <p className="kac-err">{payErr}</p>}
                        {pay && (
                          <>
                            <p style={{ margin: "0 0 8px" }}>Amount: <b>{money(pay.amount, pay.currency)}</b></p>
                            {m === "ideal" && <p className="kac-pm-off" style={{ margin: "0 0 4px" }}>You'll approve the payment in your banking app and return here automatically.</p>}
                            <form action={pay.shopperResultUrl} className="paymentWidgets" data-brands={pay.brands}></form>
                            <div className="kac-timer">Your spot is held for {Math.max(0, Math.round((pay.expiresAt - now) / 60000))} more minutes.</div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                <p className="kac-trust">🔒 Secure payment. You book directly with the activity provider via Kick Ass Commerce.</p>
                <button className="kac-link" onClick={() => goBack(1)}>‹ Back to your details</button>
              </div>
            </>
          )}
        </section>
        {Summary}
      </div>
      {step === 0 && (
        <div className="kac-sticky">
          <div style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{money(total("USD"), "USD")}</div>
          <button className="kac-btn" disabled={!slot || paxCount === 0} onClick={() => setStep(1)}>{needTime ? "Choose a time" : "Book now"}</button>
        </div>
      )}
    </div>
  );
}
