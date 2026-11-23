# Bullrush · Live darts
Svensk dartapp för iPhone/Safari och andra moderna webbläsare. Statiska filerna i `dist` serveras över HTTPS för kameraåtkomst. Inga JS-beroenden eller byggsteg.

## Funktioner
301/501, en eller två spelare, ett leg, dubbel/rak ut, bust, ångra, korrigering av varje pil, manuellt tavltryck/knappsats, utgångsförslag och lokal matchhistorik. Layout med mörkblå bakgrund, blå kontroller, rosa aktiv spelare och en ritad darttavla.

## Kontinuerlig kameraavläsning · experimentell
1. Starta bakre kameran och rikta den stabilt mot tom tavla med 20 överst.
2. Kalibrera dubbelringens ytterkant i ordningen 20, 6, 3, 11.
3. Låt automatiken ta en stabil tom referensbild. Återgå med Klart; en levande miniatyr visas under matchen.
4. Kasta en pil i taget och vänta på Redo för nästa pil. Automatiken registrerar träfförslag utan en knapptryckning per pil.
5. Tre pilar, bust eller utgång växlar till väntan på tom tavla. När tavlan är tom och stilla räknas omgången och nästa spelare aktiveras.
6. Tryck på en pil i raden för att rätta den. Ångra återställer senaste ändringen. Missar matas in manuellt.

Bildanalysen körs lokalt på enheten och skickar inga kamerabilder. En perspektivtransformation och en mask för tavlan används. Efter bildstabilisering söker gråskaledifferensen avlånga sammanhängande komponenter. PCA ger längdaxeln, och ändpunkten närmast tavlans mitt används som spetsförslag. Förslaget måste vara stabilt i tre analyser innan automatisk registrering. Referensbilden ersätts direkt efter registrering för att undvika dubbelräkning. Tomtavlereferensen bevaras för att identifiera urtagning. Modal dialog, bakgrund och paus stoppar behandling; återupptagning tar en ny referens mot det synliga läget utan att räkna synliga pilar igen. Skärmlås motverkas med Screen Wake Lock där webbläsaren stöder det.

### Begränsningar
Detta är en enkel, ännu ej fysiskt validerad heuristik. Den är inte en tränad dartmodell och har ingen uppmätt träffsäkerhet. Den radiella spetsuppskattningen kan välja fel ände. Skuggor, kameraförflyttning, skiftande ljus, överlappning och snabba kast kan ge fel eller missade registreringar. Missar lämnar ingen bildförändring och detekteras inte. Kameran kräver stabil placering, fri sikt och kalibrering efter flytt. Om tom tavla inte känns igen kan Nästa användas manuellt. Säkerställ korrekt poäng före nästa omgång. Safari på användarens fysiska iPhone och verkliga kast återstår att testa.

## Verifiering
- `node checks.mjs`: poänggeometri, perspektiv, bust och utgångar.
- `node detection-checks.mjs`: syntetiska kamerabilder av flera pilar, ingen dubbelräkning, urtagning, ny omgång, återupptagning och ljusförändring. Detta är ingen mätning av verklig träffsäkerhet.
- Webbläsare: rättning T20 till 20, matchstart med två spelare, 180-omgång, spelarbyte, kameravy, dialoger och mobilvy.

## Installera och starta

Öppna den publicerade HTTPS-adressen i Safari på iPhone. Välj **Dela**, sedan **Lägg till på hemskärmen** och **Lägg till**. På Android kan du välja **Installera app** i Chrome-menyn när alternativet visas. Öppna appen online en gång på den enhet där du vill spela offline. Matchresultatet sparas i samma webbläsare eller installerade app.

Öppna `Bullrush.code-workspace` i Visual Studio Code. Kör `npm start` i terminalen och öppna `http://localhost:8080`. Node.js 20 eller senare krävs. Kör `npm test` för att testa poängräkningen och kameraanalysen med simulerade bilder. Projektet har inga externa npm-beroenden. Kameraåtkomst från mobilen kräver HTTPS.
