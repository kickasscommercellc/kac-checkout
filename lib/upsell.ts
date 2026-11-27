/**
 * "Complete your trip" op de bevestigingspagina (Earnie).
 * Per kaart: een affiliatewidget (plak de embedcode van de partner in `embed`) of een gewone link.
 * Widgets draaien in een afgeschermd iframe (sandbox zonder same-origin): ze kunnen niet bij onze pagina of cookies.
 * NOOIT op de betaalpagina: alleen hier, na de betaling.
 */
export type UpsellCard = {
  id: string;
  label: string; // bijv. "Car rental"
  title: string;
  text?: string;
  embed?: string; // HTML/script van de affiliatepartner
  height?: number; // hoogte van de widget in px
  href?: string; // alternatief: affiliatelink
  cta?: string;
};

export const UPSELL: UpsellCard[] = [
  // Voorbeeld — vervang door echte widgets:
  // { id: "cars", label: "Car rental", title: "Explore the island at your own pace", embed: `<script src="..."></script>`, height: 420 },
];

export const UPSELL_DEMO: UpsellCard[] = [
  { id: "act", label: "More activities", title: "Snorkel the reef the next day", text: "Popular with guests on this trip.", href: "#", cta: "See activities" },
  { id: "cars", label: "Car rental", title: "Explore the island at your own pace", text: "Affiliate widget appears here.", href: "#", cta: "Compare cars" },
  { id: "stay", label: "Where to stay", title: "Still looking for a place to stay?", text: "Affiliate widget appears here.", href: "#", cta: "Find a stay" },
];

/**
 * Earnie-producten op de bevestigingspagina (af te halen bij vertrek).
 * Later uit de Medusa-backend; nu vaste voorbeelden.
 */
export type Product = { id: string; title: string; text: string; price: number; currency: string; tag?: string; image?: string };

export const PRODUCTS_DEMO: Product[] = [
  { id: "phone-case", title: "Waterproof phone case", text: "Take photos in the water. Fits all phones.", price: 19, currency: "USD", tag: "Most popular", image: "/demo/phone-case.svg" },
  { id: "sunscreen", title: "Reef-safe sunscreen", text: "SPF 50, kind to the coral.", price: 16, currency: "USD", image: "/demo/sunscreen.svg" },
  { id: "dry-bag", title: "Dry bag 10L", text: "Keeps your phone and keys dry.", price: 24, currency: "USD", image: "/demo/dry-bag.svg" },
];
