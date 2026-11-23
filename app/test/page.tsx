"use client";
import { useEffect, useState } from "react";

/** TESTPAGINA — alleen voor het testen van de koppelingen met het Demo-product. Geen eindontwerp. */
type Slot = { date: string; startTime: string; startTimeId: number; rateId?: number };
type Info = { id: number; title: string; rates: { id: number }[]; pricingCategories: { id: number; title: string }[]; slots: Slot[] };

export default function TestCheckout() {
  const [info, setInfo] = useState<Info | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [method, setMethod] = useState("ideal");
  const [c, setC] = useState({ firstname: "Test", surname: "KAC Checkout", email: "info@kickasscommerce.com", phone: "+31612345678", country: "NL" });
  const [status, setStatus] = useState("");
  const [widget, setWidget] = useState<{ scriptUrl: string; brands: string; shopperResultUrl: string; amount: number; currency: string } | null>(null);

  useEffect(() => {
    fetch("/api/availability?activityId=842117").then((r) => r.json()).then((j) => { setInfo(j); setSlot(j.slots?.[0] ?? null); });
  }, []);

  useEffect(() => {
    if (!widget) return;
    const s = document.createElement("script");
    s.src = widget.scriptUrl;
    s.async = true;
    document.body.appendChild(s);
    return () => { s.remove(); };
  }, [widget]);

  async function reserve() {
    if (!info || !slot) return;
    setStatus("Reserveren in Bókun…");
    const res = await fetch("/api/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method,
        customer: c,
        travelDate: slot.date,
        booking: {
          mainContactDetails: [],
          activityBookings: [{ activityId: info.id, rateId: slot.rateId ?? info.rates[0]?.id, startTimeId: slot.startTimeId, date: slot.date, passengers: [{ pricingCategoryId: info.pricingCategories[0].id }] }],
        },
      }),
    });
    const j = await res.json();
    if (!res.ok) { setStatus("Fout: " + JSON.stringify(j.error ?? j)); return; }
    if (j.provider === "tmt") { setStatus("Kaart via Repayd volgt zodra Server2Server is aangezet. Kies iDEAL om te testen."); return; }
    setStatus(`Gereserveerd. Te betalen: ${j.amount} ${j.currency}`);
    setWidget({ scriptUrl: j.axcess.scriptUrl, brands: j.axcess.brands, shopperResultUrl: j.axcess.shopperResultUrl, amount: j.amount, currency: j.currency });
  }

  const box = { maxWidth: 520, margin: "32px auto", padding: 24, border: "1px solid #ddd", borderRadius: 12 } as const;
  return (
    <main style={box}>
      <p style={{ background: "#fff3cd", padding: 8, borderRadius: 6 }}>TESTPAGINA — Demo-product, test-betaalomgeving</p>
      <h1 style={{ fontSize: 22 }}>{info?.title ?? "Laden…"}</h1>
      {info && (
        <>
          <label>Datum en tijd<br />
            <select value={slot?.startTimeId + "_" + slot?.date} onChange={(e) => setSlot(info.slots.find((s) => s.startTimeId + "_" + s.date === e.target.value) ?? null)}>
              {info.slots.map((s) => <option key={s.startTimeId + s.date} value={s.startTimeId + "_" + s.date}>{s.date} {s.startTime}</option>)}
            </select>
          </label>
          <p>1 × {info.pricingCategories[0]?.title}</p>
          {(["firstname", "surname", "email", "phone", "country"] as const).map((k) => (
            <div key={k}><label>{k}<br /><input value={c[k]} onChange={(e) => setC({ ...c, [k]: e.target.value })} /></label></div>
          ))}
          <p>Betaalmethode:{" "}
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="ideal">iDEAL (EUR)</option>
              <option value="applepay">Apple Pay</option>
              <option value="googlepay">Google Pay</option>
              <option value="card">Creditcard (Repayd)</option>
            </select>
          </p>
          {!widget && <button onClick={reserve} style={{ padding: "10px 20px" }}>Reserveren en betalen</button>}
        </>
      )}
      <p>{status}</p>
      {widget && <form action={widget.shopperResultUrl} className="paymentWidgets" data-brands={widget.brands}></form>}
    </main>
  );
}
