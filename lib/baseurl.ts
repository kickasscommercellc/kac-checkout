import { env } from "./env";

/** Our own hosts. The guest returns to the domain they started on; anything else falls back to APP_BASE_URL. */
const OWN_HOSTS = ["checkout.kickasscommerce.com", "kac-checkout.vercel.app", "localhost:3000"];

export function baseUrl(req: Request): string {
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").toLowerCase();
  if (OWN_HOSTS.includes(host)) return host.startsWith("localhost") ? `http://${host}` : `https://${host}`;
  return env("APP_BASE_URL");
}
