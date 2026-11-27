"use client";
import { useEffect, useState } from "react";
import type { Product } from "../../../lib/upsell";

type Method = "card" | "ideal" | "applepay" | "googlepay";
type Pay = { scriptUrl: string; brands: string; shopperResultUrl: string; amount: number; currency: string; label: string; entityId?: string };
type Bundle = { title: string; price: number; currency: string; subtitle: string };

const fmt = (n: number, cur: string, dec = 0) => new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: dec, minimumFractionDigits: dec }).format(n);

/**
 * "You Might Also Like" + betaalpaneel. Zelfde betaalmethodes, volgorde en stijl als de boeking (herkenning).
 * Bedragen worden op de server bepaald; de browser stuurt alleen product-id's en aantallen.
 */
export default function Upsell(p: {
  products: Product[]; bundle: Bundle; t?: string; demo: boolean; back: string; added?: string; addfail?: boolean;
  pickup: string; country?: string;
}) {
  const addedIds = new Set((p.added ?? "").split(",").filter(Boolean).map((x) => x.split(":")[0]));
  const [sheet, setSheet] = useState<null | { bundle?: boolean; id?: string }>(null);
  const [qty, setQty] = useState(1);
  const [method, setMethod] = useState<Method | null>(null);
  const [pay, setPay] = useState<Pay | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState(p.added ? "ok" : p.addfail ? "fail" : "");
  const [canApplePay, setCanApplePay] = useState(false);
  useEffect(() => { try { setCanApplePay(!!(window as any).ApplePaySession && (window as any).ApplePaySession.canMakePayments()); } catch {} }, []);
  useEffect(() => { if (!toast) return; const x = setTimeout(() => setToast(""), 6000); return () => clearTimeout(x); }, [toast]);

  const product = sheet?.id ? p.products.find((x) => x.id === sheet.id) : undefined;
  const fullPrice = p.products.reduce((a, x) => a + x.price, 0);
  const total = sheet?.bundle ? p.bundle.price : (product?.price ?? 0) * qty;

  const open = (s: { bundle?: boolean; id?: string }) => { setSheet(s); setQty(1); setMethod(null); setPay(null); setErr(""); };
  const close = () => { setSheet(null); setMethod(null); setPay(null); };

  async function start(m: Method) {
    if (busy) return;
    setMethod(m); setPay(null); setErr(""); setBusy(true);
    try {
      const res = await fetch("/api/upsell/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: m, t: p.t, demo: p.demo, back: p.back, bundle: !!sheet?.bundle, items: sheet?.id ? [{ id: sheet.id, qty }] : undefined }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Something went wrong");
      setPay(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  // ACI-widget laden voor de gekozen methode (zelfde instellingen als de boeking).
  useEffect(() => {
    if (!pay || !method) return;
    (window as any).wpwlOptions =
      method === "card"
        ? {
            style: "plain", brandDetection: true, brandDetectionType: "binlist",
            billingAddress: { country: (p.country || "").toUpperCase() },
            mandatoryBillingFields: { country: true, state: false, city: false, postcode: false, street1: true, street2: false },
            onReady: () => {
              ["billing.state", "billing.city", "billing.postcode", "billing.street2"].forEach((n) =>
                document.querySelectorAll(`[name="${n}"]`).forEach((el) => {
                  (el as HTMLElement).style.display = "none";
                  const id = (el as HTMLElement).id;
                  if (id) document.querySelectorAll(`label[for="${id}"]`).forEach((l) => ((l as HTMLElement).style.display = "none"));
                }),
              );
            },
          }
        : method === "googlepay"
        ? { style: "plain", googlePay: { gatewayMerchantId: pay.entityId, merchantName: "Kick Ass Commerce", allowedAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"], allowedCardNetworks: ["VISA", "MASTERCARD", "DISCOVER"] } }
        : { style: "plain" };
    const s = document.createElement("script");
    s.src = pay.scriptUrl; s.async = true;
    document.body.appendChild(s);
    return () => { try { (window as any).wpwl?.unload?.(); } catch {} s.remove(); };
  }, [pay, method]);

  const all: Record<Method, [Method, string, string]> = {
    ideal: ["ideal", "iDEAL | Wero", "Pay in EUR with your Dutch bank app"],
    applepay: ["applepay", "Apple Pay", "Fast and secure with Face ID or Touch ID"],
    googlepay: ["googlepay", "Google Pay", "Fast and secure with your Google account"],
    card: ["card", "Cards · Visa, Mastercard, Discover, Diners", ""],
  };
  const wallet: Method[] = canApplePay ? ["applepay", "googlepay"] : ["googlepay"];
  const order: Method[] = (p.country || "").toUpperCase() === "NL" ? ["ideal", ...wallet, "card"] : [...wallet, "card", "ideal"];
  const save = fullPrice - p.bundle.price;
  const shown = pay ? fmt(pay.amount, pay.currency, pay.amount % 1 ? 2 : 0) : fmt(total, "USD");

  return (
    <section className="kac-c1-up">
      <h2>You Might Also Like</h2>
      <div className="kac-c1-prods">
        {p.products.map((x) => (
          <div key={x.id} className="kac-card kac-c1-prod">
            {x.image ? <img src={x.image} alt={x.title} loading="lazy" /> : <div className="kac-c1-ph" aria-hidden />}
            <div className="kac-c1-pt">{x.title}</div>
            <div className="kac-c1-pd">{x.text}</div>
            <div className="kac-c1-pf">
              <b>{fmt(x.price, x.currency)}</b>
              {addedIds.has(x.id) ? <span className="kac-c1-added">✓ Added</span> : <button onClick={() => open({ id: x.id })}>Add</button>}
            </div>
          </div>
        ))}
      </div>
      {!p.products.every((x) => addedIds.has(x.id)) && (
        <div className="kac-c1-bundle">
          <div>
            <div className="kac-c1-bt">{p.bundle.title} {fmt(p.bundle.price, p.bundle.currency)} {save > 0 && <span className="kac-c1-save">Save {fmt(save, p.bundle.currency)}</span>}</div>
            <div className="kac-c1-bs">{p.bundle.subtitle}</div>
          </div>
          <button onClick={() => open({ bundle: true })}>Add all</button>
        </div>
      )}

      {sheet && (
        <div className="kac-sh-dim" onClick={close}>
          <div className="kac-sh" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="kac-sh-grab" />
            <button className="kac-sh-x" aria-label="Close" onClick={close}>✕</button>
            {sheet.bundle ? (
              <>
                <div className="kac-sh-title">{p.bundle.title} {fmt(p.bundle.price, p.bundle.currency)} {save > 0 && <span className="kac-c1-save">Save {fmt(save, p.bundle.currency)}</span>}</div>
                <div className="kac-sh-thumbs">{p.products.map((x) => x.image && <img key={x.id} src={x.image} alt="" />)}</div>
                <div className="kac-sh-sub">{p.products.map((x) => x.title).join(" · ")}</div>
              </>
            ) : product && (
              <div className="kac-sh-prod">
                {product.image && <img src={product.image} alt="" />}
                <div style={{ flex: 1 }}>
                  <div className="kac-sh-title">{product.title}</div>
                  <div className="kac-sh-sub">{product.text}</div>
                </div>
              </div>
            )}
            {!sheet.bundle && (
              <div className="kac-sh-qty">
                <span>Quantity</span>
                <div>
                  <button aria-label="Less" disabled={qty <= 1 || !!method} onClick={() => setQty(qty - 1)}>−</button>
                  <b>{qty}</b>
                  <button aria-label="More" disabled={qty >= 10 || !!method} onClick={() => setQty(qty + 1)}>+</button>
                </div>
              </div>
            )}
            <div className="kac-sh-pick">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></svg>
              <div><b>Pick up at departure</b>{p.pickup}</div>
            </div>
            <div className="kac-sh-tot"><span>Total</span><b>{sheet.bundle && !pay && save > 0 && <s>{fmt(fullPrice, "USD")}</s>}{shown}</b></div>

            <div className="kac-sh-lab">Choose how to pay</div>
            {order.map((m) => all[m]).map(([m, label, sub]) => (
              <div key={m} className={"kac-pm" + (method === m ? " open" : "")}>
                <button className="kac-pm-h" onClick={() => start(m)} disabled={busy}>
                  <span>{label}{sub && <span className="kac-pm-off" style={{ display: "block", fontWeight: 400 }}>{sub}</span>}</span>
                  <span>{method === m ? "▾" : "›"}</span>
                </button>
                {method === m && (
                  <div className="kac-pm-b">
                    {busy && <p className="kac-pm-off">One moment…</p>}
                    {err && <p className="kac-err">{err}</p>}
                    {pay && (
                      <>
                        {m === "ideal" && <p className="kac-pm-off" style={{ margin: "0 0 4px" }}>You'll approve the payment in your banking app and come straight back here.</p>}
                        <form action={pay.shopperResultUrl} className="paymentWidgets" data-brands={pay.brands}></form>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
            <p className="kac-sh-trust">🔒 Secure payment via Kick Ass Commerce</p>
          </div>
        </div>
      )}

      {toast && (
        <div className={"kac-toast" + (toast === "fail" ? " fail" : "")} role="status">
          {toast === "ok" ? (
            <><span className="kac-toast-ok">✓</span><div><b>Added to your trip</b><br />Ready at departure. Receipt sent by email.</div></>
          ) : (
            <><span className="kac-toast-ok">!</span><div><b>Payment didn't go through</b><br />No money was charged. Please try again.</div></>
          )}
        </div>
      )}
    </section>
  );
}
