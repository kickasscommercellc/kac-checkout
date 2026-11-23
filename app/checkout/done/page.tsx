const MESSAGES: Record<string, { en: string; nl: string }> = {
  success: { en: "Your booking is confirmed!", nl: "Je boeking is bevestigd!" },
  review: { en: "Payment received, we are checking it.", nl: "Betaling ontvangen, we controleren deze nog." },
  pending: { en: "Your payment is being processed.", nl: "Je betaling wordt nog verwerkt." },
  failed: { en: "Payment failed. No money was charged.", nl: "Betaling mislukt. Er is niets afgeschreven." },
  expired: { en: "Your reservation expired. Please try again.", nl: "Je reservering is verlopen. Probeer het opnieuw." },
  attention: { en: "Payment received; we will confirm your booking shortly.", nl: "Betaling ontvangen; we bevestigen je boeking zo snel mogelijk." },
  error: { en: "Something went wrong.", nl: "Er ging iets mis." },
};

export default async function Done({ searchParams }: { searchParams: Promise<{ status?: string; code?: string; reason?: string }> }) {
  const { status = "error", code, reason } = await searchParams;
  const m = MESSAGES[status] ?? MESSAGES.error;
  return (
    <main style={{ padding: 32, maxWidth: 560, margin: "0 auto" }}>
      <h1>{m.en}</h1>
      <p>{m.nl}</p>
      {code && <p>Booking reference: <strong>{code}</strong></p>}
      {reason && <p style={{ color: "#888", fontSize: 13 }}>Technische info: {reason}</p>}
    </main>
  );
}
