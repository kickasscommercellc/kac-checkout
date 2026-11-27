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
