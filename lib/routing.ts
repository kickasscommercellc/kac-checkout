/**
 * Welke partij verwerkt de kaartbetaling? Instelbaar zonder codewijziging:
 *   CARD_PROVIDER=aci                      -> standaard voor iedereen (ACI/AxcessMS via Repayd)
 *   CARD_PROVIDER_BY_COUNTRY=US:stripe     -> uitzonderingen per land van de bezoeker (komma-gescheiden)
 * Het land komt van Vercel (header x-vercel-ip-country).
 */
export type CardProvider = "aci" | "stripe" | "tmt";
const VALID: CardProvider[] = ["aci", "stripe", "tmt"];

export function cardProviderFor(country: string | null | undefined): CardProvider {
  const def = (process.env.CARD_PROVIDER || "aci") as CardProvider;
  const map = new Map(
    (process.env.CARD_PROVIDER_BY_COUNTRY || "")
      .split(",")
      .map((s) => s.trim().split(":").map((x) => x.trim()))
      .filter(([c, p]) => c && VALID.includes(p as CardProvider))
      .map(([c, p]) => [c.toUpperCase(), p as CardProvider]),
  );
  return map.get((country || "").toUpperCase()) ?? (VALID.includes(def) ? def : "aci");
}

export function visitorCountry(req: Request): string | null {
  return req.headers.get("x-vercel-ip-country");
}
