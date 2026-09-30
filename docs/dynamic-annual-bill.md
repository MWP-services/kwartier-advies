# Dynamisch jaarnota-advies

De PDF-extractie herkent expliciete elektriciteitscontracten als vast, variabel of dynamisch. Alleen een leveranciernaam of vaste leveringskosten zijn geen bewijs. Bij conflicterende contracttypen blijft het type onbekend. De gebruiker kan de herkenning corrigeren.

Bij dynamisch haalt de analyseworker de laatste 365 volledige UTC-dagen op via de [EnergyZero-prijs-API](https://docs.api.energyzero.nl/docs/api/swagger/public/energy-market-service-get-prices/). De bron levert uurprijzen in EUR/kWh, inclusief negatieve waarden. De koppeling verwerkt `base[].price.value` en controleert exact 8.760 aaneengesloten uren. Er zijn maximaal vier gelijktijdige verzoeken, een timeout, één herhaling en een procescache per einddatum. Bij onvolledige data faalt de analyse zichtbaar; gemiddelde notatarieven vervangen de prijsreeks niet.

## Kosten en profiel

- Afnameprijs: `(marktprijs + inkoopopslag + energiebelasting excl. btw) × btw-factor`.
- Terugleverprijs: `(marktprijs − inhouding) × btw-factor`. Negatieve prijzen blijven behouden.
- Opslagen worden exclusief btw ingevoerd. Belasting inclusief btw wordt eerst teruggerekend. Ontbrekende componenten worden als nul behandeld en expliciet gemeld; er wordt geen wettelijk tarief ingevuld.
- Jaarlijkse netafname en teruglevering worden apart genormaliseerd over een geschat huishoudelijk of zakelijk profiel met seizoen-, week- en lokale uurpatronen (Europe/Amsterdam). Dit is geen gevalideerd standaardprofiel of gemeten klantprofiel. Binnen een uurgemiddelde kunnen beide stromen voorkomen.
- Netafname en teruglevering moeten voor dynamisch expliciet zijn ingevoerd (nul teruglevering is geldig). De ingevoerde hoeveelheden gelden als jaarvolumes; afwijkende notaperioden worden niet automatisch omgerekend.

## Batterijmodel

De chronologische simulatie vergelijkt dezelfde uurreeks met en zonder batterij. Zij houdt rekening met SOC, noodstroomreserve, 95% rendement, het door de gebruiker bevestigde laad- en ontlaadvermogen van 0,5C (40 kWh batterij: 20 kW omvormer). Er is geen vaste jaargrens voor cycli. Equivalente volledige cycli worden achteraf berekend als ontladen energie gedeeld door de bruikbare capaciteit; meerdere cycli per dag zijn mogelijk. De eenvoudige route voor vaste tarieven behoudt zijn benuttingsaanname van maximaal 230 cycli omdat daar geen uurprofiel wordt gesimuleerd. Zonnestroom en goedkoop geladen netstroom worden afzonderlijk bijgehouden. De sturing gebruikt maximaal 24 uur toekomstige historische prijzen en geschatte vraag, met 2 cent marge voor netladen. Dit is een heuristiek, geen optimale handelsstrategie. De beginvoorraad boven de reserve is nul; resterende eindvoorraad krijgt geen financiële vergoeding.

Besparing = stroomkosten zonder batterij − stroomkosten met batterij. Vermeden afname telt één keer mee, gemiste teruglevering en netlaadkosten worden verrekend. De dynamische keuze gebruikt de kortste eenvoudige terugverdientijd onder opties met positieve besparing. De bestaande investeringsschattingen blijven gelden; een handmatig investeringsbedrag geldt in de bestaande invoer voor alle opties. Een offerte per capaciteit blijft nodig.

Het rapport vermeldt prijsbron, periode, ophaaldatum, profiel, gewogen tarieven en kostenverschillen. De marge van ±25% is een rekenmarge, geen statistisch betrouwbaarheidsinterval. Saldering, vaste terugleverkosten, onderhoud, degradatie, financiering, aansluitlimieten en toekomstige prijswijzigingen zijn niet gemodelleerd. Btw-behandeling voor teruglevering is gelijk verondersteld aan afname.

## Verificatie

`tests/dynamicAnnualBill.test.ts` controleert contractherkenning, bronformaat, volledige prijsdekking, negatieve prijzen, jaarvolumes, prijsweging, btw, energiebehoud, rendabiliteit en rapportage. Live broncontrole op 30 september 2026 leverde alle 8.760 uren van 30 september 2025 tot 30 september 2026 (exclusieve einddatum).
