import "../../book/book.css";
import "./done.css";
import { readOrderForDisplay, readDocs } from "../../../lib/order";
import { UPSELL, PRODUCTS_DEMO } from "../../../lib/upsell";
import { googleCalendarUrl, directionsUrl, placeText } from "../../../lib/calendar";

const MESSAGES: Record<string, { title: string; text: string; tone: "ok" | "wait" | "bad" }> = {
  success: { title: "You're booked!", text: "Your booking is confirmed. Your tickets are on their way to your inbox.", tone: "ok" },
  review: { title: "Payment received", text: "We're doing a quick final check. You'll get your confirmation by email shortly.", tone: "wait" },
  pending: { title: "Payment is processing", text: "This can take a few minutes. You'll get your confirmation by email as soon as it's done.", tone: "wait" },
  attention: { title: "Payment received", text: "We're finalising your booking and will email your confirmation shortly. No need to book again.", tone: "wait" },
  failed: { title: "Payment didn't go through", text: "No money was charged. You can try again or pick another payment method.", tone: "bad" },
  expired: { title: "Your reservation expired", text: "We hold your spot for 30 minutes. Please start again; it only takes a minute.", tone: "bad" },
  error: { title: "Something went wrong", text: "No booking was made. Please try again, or contact us if this keeps happening.", tone: "bad" },
};

const DEMO = {
  confirmationCode: "DEMO-123456", amount: 178, currency: "USD", provider: "axcess" as const, vendor: "demo", expiresAt: 0,
  d: { title: "Sunset Sail & Snorkel", date: "2026-12-12", startTime: "16:30", pax: 2, durationMin: 150, email: "you@example.com", meeting: { name: "Harbour Village Marina", address: "Kaya Gobernador N. Debrot, Kralendijk, Bonaire", lat: 12.1636, lng: -68.2797 } },
};

const WHATSAPP = process.env.SUPPORT_WHATSAPP?.replace(/[^\d]/g, "") || "";
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "info@kickasscommerce.com";

export default async function Done({ searchParams }: { searchParams: Promise<{ status?: string; code?: string; reason?: string; t?: string; demo?: string; docs?: string }> }) {
  const sp = await searchParams;
  const demo = sp.demo === "1";
  const { status = "error", reason, t } = sp;
  const code = demo ? "DEMO-123456" : sp.code;
  const m = MESSAGES[status] ?? MESSAGES.error;
  // ?demo=1 toont voorbeeldgegevens, alleen om het ontwerp te bekijken.
  const o = demo ? DEMO : t ? readOrderForDisplay(t) : null;
  const d = o && code && o.confirmationCode === code ? o.d : undefined;
  const paid = m.tone !== "bad";
  const docs = demo ? { code: "DEMO", tickets: ["#"], invoice: "#" } : sp.docs ? readDocs(sp.docs) : null;
  const docUrl = (kind: string, i = 0) => (demo ? "#" : `/api/docs?d=${encodeURIComponent(sp.docs!)}&kind=${kind}&i=${i}`);
  const dir = d ? directionsUrl(d) : null;
  const wa = WHATSAPP ? `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(`Hi! Question about my booking ${code ?? ""}`.trim())}` : null;
  const dateText = d ? new Date(d.date + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "";
  const money = o ? new Intl.NumberFormat("en-US", { style: "currency", currency: o.currency }).format(o.amount) : "";

  return (
    <main className="kac">
      <div className="kac-done">
        <div className={`kac-done-hero ${m.tone}`}>
          <div className="kac-done-icon" aria-hidden>
            {m.tone === "ok" ? (
              <svg viewBox="0 0 24 24" width="30" height="30"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            ) : m.tone === "wait" ? (
              <svg viewBox="0 0 24 24" width="28" height="28"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.2" /><path d="M12 7v5l3 2" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="28" height="28"><path d="M12 7v6M12 16.5v.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
            )}
          </div>
          <h1>{m.title}</h1>
          <p>{m.text}</p>
          {paid && code && (
            <div className="kac-done-ref">
              Booking reference <strong>{code}</strong>
            </div>
          )}
        </div>

        {paid && d && (
          <div className="kac-card kac-done-card">
            <div className="kac-done-title">{d.title}</div>
            <dl className="kac-done-list">
              <div><dt>Date</dt><dd>{dateText}</dd></div>
              {d.startTime && <div><dt>Time</dt><dd>{d.startTime}</dd></div>}
              {d.pax && <div><dt>Guests</dt><dd>{d.pax} {d.pax === 1 ? "person" : "people"}</dd></div>}
              {d.meeting && placeText(d) && <div><dt>Meeting point</dt><dd>{placeText(d)}</dd></div>}
              {o && <div><dt>Paid</dt><dd>{money} · all fees included</dd></div>}
              {d.email && <div><dt>Tickets sent to</dt><dd>{d.email}</dd></div>}
            </dl>
            <div className="kac-done-actions">
              <a className="kac-done-btn primary" href={googleCalendarUrl(d, code!)} target="_blank" rel="noopener">Add to Google Calendar</a>
              <a className="kac-done-btn" href={demo ? "#" : `/api/calendar?t=${encodeURIComponent(t!)}`}>Apple / Outlook calendar</a>
              {dir && <a className="kac-done-btn" href={dir} target="_blank" rel="noopener">Get directions</a>}
            </div>
          </div>
        )}

        {paid && docs && (docs.tickets.length > 0 || docs.invoice) && (
          <div className="kac-card kac-done-card">
            <div className="kac-done-title">Your documents</div>
            <div className="kac-done-actions" style={{ marginTop: 0 }}>
              {docs.tickets.map((_, i) => (
                <a key={i} className="kac-done-btn primary" href={docUrl("ticket", i)}>
                  Download ticket{docs.tickets.length > 1 ? ` ${i + 1}` : ""} (PDF)
                </a>
              ))}
              {docs.invoice && <a className="kac-done-btn" href={docUrl("invoice")}>Download invoice (PDF)</a>}
            </div>
          </div>
        )}

        {paid && (
          <div className="kac-card kac-done-next">
            <h2>What happens next</h2>
            <ol>
              <li>Check your inbox for your confirmation and tickets (and your spam folder, just in case).</li>
              <li>Show your ticket on your phone when you arrive. No need to print.</li>
              <li>Please arrive 15 minutes before the start time.</li>
            </ol>
          </div>
        )}

        {paid && demo && (
          <section className="kac-up">
            <h2>You Might Also Like This</h2>
            <p className="kac-up-sub">Pick up at departure. No shipping, no hassle.</p>
            <div className="kac-prod-grid">
              {PRODUCTS_DEMO.map((p) => (
                <div key={p.id} className="kac-card kac-prod">
                  {p.image ? <img className="kac-prod-img" src={p.image} alt={p.title} loading="lazy" /> : <div className="kac-prod-img" aria-hidden />}
                  {p.tag && <span className="kac-up-label">{p.tag}</span>}
                  <div className="kac-up-title">{p.title}</div>
                  <p>{p.text}</p>
                  <div className="kac-prod-foot">
                    <b>{new Intl.NumberFormat("en-US", { style: "currency", currency: p.currency, maximumFractionDigits: 0 }).format(p.price)}</b>
                    <a className="kac-done-btn primary" href="#">Add</a>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {paid && UPSELL.length > 0 && (
          <section className="kac-up">
            <h2>Complete your trip</h2>
            <div className="kac-up-grid">
              {UPSELL.map((u) => (
                <div key={u.id} className={"kac-card kac-up-card" + (u.embed ? " wide" : "")}>
                  <span className="kac-up-label">{u.label}</span>
                  <div className="kac-up-title">{u.title}</div>
                  {u.text && <p>{u.text}</p>}
                  {u.embed ? (
                    <iframe
                      title={u.title}
                      className="kac-up-frame"
                      style={{ height: u.height ?? 400 }}
                      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms"
                      referrerPolicy="no-referrer"
                      srcDoc={`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>body{margin:0;font-family:system-ui,sans-serif}</style></head><body>${u.embed}</body></html>`}
                    />
                  ) : (
                    u.href && <a className="kac-done-btn" href={u.href} target="_blank" rel="noopener sponsored">{u.cta ?? "View"}</a>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="kac-done-help">
          {!paid && (
            <a className="kac-done-btn primary" href="javascript:history.go(-2)">Try again</a>
          )}
          {wa && <a className="kac-done-btn wa" href={wa} target="_blank" rel="noopener">Questions? WhatsApp us</a>}
          <a className="kac-done-btn" href={`mailto:${SUPPORT_EMAIL}${code ? `?subject=${encodeURIComponent("Booking " + code)}` : ""}`}>Email us</a>
        </div>
        {!paid && reason && <p className="kac-done-tech">Technical info: {reason}</p>}
      </div>
    </main>
  );
}
