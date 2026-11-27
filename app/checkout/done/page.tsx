import "../../book/book.css";
import "./done.css";
import { headers } from "next/headers";
import { readOrderForDisplay, readDocs } from "../../../lib/order";
import { UPSELL, PRODUCTS_DEMO, BUNDLE_DEMO } from "../../../lib/upsell";
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


const Ico = {
  ticket: <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h14a1.5 1.5 0 0 1 1.5 1.5V10a2 2 0 0 0 0 4v2.5A1.5 1.5 0 0 1 19 18H5a1.5 1.5 0 0 1-1.5-1.5V14a2 2 0 0 0 0-4zM14 6v12" />,
  invoice: <path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5" />,
  calendar: <path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5v-12A1.5 1.5 0 0 1 5 5zM3.5 10h17M8 3v4M16 3v4" />,
  directions: <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11zM12 12.3a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6z" />,
};
const Icon = ({ k }: { k: keyof typeof Ico }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{Ico[k]}</svg>
);

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
  const shortDate = d ? new Date(d.date + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : "";
  // Agenda: Apple-apparaten krijgen het .ics-bestand, de rest Google Calendar.
  const ua = (await headers()).get("user-agent") || "";
  const apple = /iPhone|iPad|Macintosh/.test(ua);
  const actions: { label: string; icon: "ticket" | "invoice" | "calendar" | "directions"; href: string; ext?: boolean }[] = [];
  if (paid && docs) {
    docs.tickets.forEach((_, i) => actions.push({ label: docs.tickets.length > 1 ? `Ticket ${i + 1}` : "Ticket", icon: "ticket", href: docUrl("ticket", i) }));
    if (docs.invoice) actions.push({ label: "Invoice", icon: "invoice", href: docUrl("invoice") });
  }
  if (paid && d && code) {
    actions.push(apple ? { label: "Calendar", icon: "calendar", href: demo ? "#" : `/api/calendar?t=${encodeURIComponent(t!)}` } : { label: "Calendar", icon: "calendar", href: googleCalendarUrl(d, code), ext: true });
    if (dir) actions.push({ label: "Directions", icon: "directions", href: dir, ext: true });
  }
  const money = o ? new Intl.NumberFormat("en-US", { style: "currency", currency: o.currency }).format(o.amount) : "";

  return (
    <main className="kac">
      <div className="kac-done">
        {paid ? (
          <div className="kac-c1-head">
            <span className={`kac-c1-ok ${m.tone}`} aria-hidden>
              {m.tone === "ok" ? (
                <svg viewBox="0 0 24 24" width="20" height="20"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="8" fill="none" stroke="#fff" strokeWidth="2.4" /><path d="M12 8v4.5l2.5 1.5" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" /></svg>
              )}
            </span>
            <div>
              <h1>{m.tone === "ok" ? "You're booked!" : m.title}</h1>
              <p>{m.tone === "ok" ? (d?.email ? `Tickets sent to ${d.email}` : "Your tickets are on their way to your inbox.") : m.text}</p>
            </div>
          </div>
        ) : (
          <div className={`kac-done-hero ${m.tone}`}>
            <div className="kac-done-icon" aria-hidden>
              <svg viewBox="0 0 24 24" width="28" height="28"><path d="M12 7v6M12 16.5v.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
            </div>
            <h1>{m.title}</h1>
            <p>{m.text}</p>
          </div>
        )}

        {paid && (d || code) && (
          <div className="kac-card kac-c1-sum">
            {d && <div className="kac-c1-title">{d.title}</div>}
            {d && (
              <div className="kac-c1-meta">
                {[shortDate, d.startTime, d.pax ? `${d.pax} ${d.pax === 1 ? "person" : "people"}` : null].filter(Boolean).join(" · ")}
              </div>
            )}
            {d && placeText(d) && <div className="kac-c1-meta">{placeText(d)}</div>}
            {code && (
              <div className="kac-c1-ref">
                Ref <b>{code}</b>{o ? ` · ${money} paid` : ""}
              </div>
            )}
          </div>
        )}

        {paid && (actions.length > 0) && (
          <div className="kac-c1-actions" style={{ gridTemplateColumns: `repeat(${actions.length}, 1fr)` }}>
            {actions.map((x) => (
              <a key={x.label} className={"kac-c1-btn" + (x.icon === "ticket" ? " main" : "")} href={x.href} {...(x.ext ? { target: "_blank", rel: "noopener" } : {})}>
                <Icon k={x.icon} />
                {x.label}
              </a>
            ))}
          </div>
        )}

        {paid && demo && (
          <section className="kac-c1-up">
            <h2>You Might Also Like</h2>
            <div className="kac-c1-prods">
              {PRODUCTS_DEMO.map((p) => (
                <div key={p.id} className="kac-card kac-c1-prod">
                  {p.image ? <img src={p.image} alt={p.title} loading="lazy" /> : <div className="kac-c1-ph" aria-hidden />}
                  <div className="kac-c1-pt">{p.title}</div>
                  <div className="kac-c1-pd">{p.text}</div>
                  <div className="kac-c1-pf">
                    <b>{new Intl.NumberFormat("en-US", { style: "currency", currency: p.currency, maximumFractionDigits: 0 }).format(p.price)}</b>
                    <a href="#">Add</a>
                  </div>
                </div>
              ))}
            </div>
            {(() => {
              const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: BUNDLE_DEMO.currency, maximumFractionDigits: 0 }).format(n);
              const save = PRODUCTS_DEMO.reduce((a, p) => a + p.price, 0) - BUNDLE_DEMO.price;
              return (
                <div className="kac-c1-bundle">
                  <div>
                    <div className="kac-c1-bt">
                      {BUNDLE_DEMO.title} {fmt(BUNDLE_DEMO.price)} {save > 0 && <span className="kac-c1-save">Save {fmt(save)}</span>}
                    </div>
                    <div className="kac-c1-bs">{BUNDLE_DEMO.subtitle}</div>
                  </div>
                  <a href="#">Add all</a>
                </div>
              );
            })()}
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

        <div className={paid ? "kac-c1-help" : "kac-done-help"}>
          {!paid && (
            <a className="kac-done-btn primary" href="javascript:history.go(-2)">Try again</a>
          )}
          {paid && <span>Questions?</span>}
          {wa && <a className={paid ? "" : "kac-done-btn wa"} href={wa} target="_blank" rel="noopener">WhatsApp us</a>}
          <a className={paid ? "" : "kac-done-btn"} href={`mailto:${SUPPORT_EMAIL}${code ? `?subject=${encodeURIComponent("Booking " + code)}` : ""}`}>Email us</a>
        </div>
        {!paid && reason && <p className="kac-done-tech">Technical info: {reason}</p>}
      </div>
    </main>
  );
}
