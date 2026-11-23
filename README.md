# Kick Ass Commerce — Checkout (Bókun + Repayd/TMT + AxcessMS)

Eigen booking-checkout die Bókun "external payment" gebruikt:

1. **Reserveren** in Bókun (`RESERVE_FOR_EXTERNAL_PAYMENT`, plek max. 30 min vast)
2. **Betalen**
   - Creditcard → Repayd / Trust My Travel modal (direct afschrijven, geen authorize)
   - iDEAL / Apple Pay / Google Pay → AxcessMS COPYandPAY (`paymentType=DB`)
3. **Bevestigen** in Bókun na server-side controle van de betaling, of **vrijgeven** bij mislukking

## Status (fase a — fundament)
- [x] Bókun API-client met handtekening (getest tegen het officiële voorbeeld uit de Bókun-docs)
- [x] Reserve / confirm / abort
- [x] TMT authstring + hashverificatie
- [x] AxcessMS checkout + statuscontrole + result codes
- [x] Ondertekend order-token (bedrag kan onderweg niet aangepast worden)
- [ ] Booking widget-interface (volgende stap)
- [ ] Testen met echte test-accounts (zie "Te verifiëren")
- [ ] Database + webhooks + rapportage (fase d)

## Te verifiëren zodra test-accounts er zijn
- Veldnaam van het totaalbedrag in de Bókun-checkout response (`app/api/reserve/route.ts`)
- Bókun abort-reserved: GET (OpenAPI-spec) of POST (help-artikel)
- Exacte TMT-statuswaarde voor een geslaagde betaling (`app/api/tmt/confirm/route.ts`)
- Of RESERVE_FOR_EXTERNAL_PAYMENT beschikbaar is op de API-key/het booking channel

## API-routes
| Route | Doel |
|---|---|
| `POST /api/reserve` | Reserveert in Bókun en zet de betaling klaar (TMT-config of AxcessMS checkout) |
| `POST /api/tmt/confirm` | Verifieert de TMT-transactie en bevestigt de boeking |
| `GET /api/axcess/result` | Terugkeer-URL na iDEAL/wallets: status opvragen, bevestigen of vrijgeven |
| `POST /api/abort` | Plek vrijgeven bij afbreken |

## Lokaal draaien
```
npm install
cp .env.example .env.local   # en invullen
npm test                      # handtekening-tests
npm run dev
```

## Online zetten (Vercel)
1. Zet deze map in een (privé) GitHub-repository.
2. In Vercel: *Add New Project* → kies de repository.
3. Vul onder *Settings → Environment Variables* alle waarden uit `.env.example` in.
4. Deploy.
