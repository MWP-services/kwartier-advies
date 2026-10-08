# Jaarnota-advies V2

`buildAnnualBillIndicativeAnalysis` is de technische bron voor UI, scenario's,
sizing en rapport. Vast, variabel en dynamisch gebruiken dezelfde technische
berekening. Prijzen, investering en terugverdientijd hebben geen invloed op
capaciteitsselectie, kandidaatset of technische confidence.

## Energie en periode

De prioriteit is een compleet `physicalEnergy`-paar, `annualizedEnergy`,
`confirmedEnergy`, daarna handmatig ingevoerde of expliciet bevestigde totalen.
Een onvolledig paar wordt nooit aangevuld met een richting uit factuurregels.
De regelparser koppelt fysieke import en export uitsluitend binnen dezelfde
herkende metersectie en periode; normaal/dal vereist beide registers. Expliciete
jaaroverzichten krijgen een afzonderlijk paar. Iedere herkenning bewaart evidence.
Netto, gesaldeerde, gefactureerde of gecompenseerde hoeveelheden blijven billing.
AI-scalarvelden kunnen geen fysieke provenance vaststellen of bevestiging geven.
Onherkende PDF-layouts vereisen de bevestigingscheckbox. Conflicten moeten eerst
worden gecorrigeerd; een checkbox alleen heft tegenstrijdige waarden niet op.

ISO-datums zijn UTC-kalenderdatums. Een einddatum is standaard exclusief;
`periodEndInclusive` bewaart expliciet `t/m` of `tot en met`. Het dagverschil krijgt
dan één extra dag. Notaties met `/` tussen tabeldatums zijn exclusief zolang de
nota geen inclusieve betekenis vermeldt. Onzekere perioden blijven te controleren.
Periodevolumes schalen met `365 / periodDays`: 330–400 dagen normaal, 270–450
dagen toegestaan (buiten 330–400 lagere confidence), daarbuiten onvoldoende.
Expliciet geannualiseerde volumes schalen niet opnieuw. Handmatige jaarwaarden
zonder periode mogen worden gebruikt met lage confidence. PDF-meterwaarden
vereisen een complete periode. Ontbrekende import of export wordt nooit geschat;
expliciet nul export is geldig en geeft `no_solar_shift`.

## Synthetisch profiel en selectie

Een vast niet-schrikkeljaar (2025) bevat 35.040 chronologische kwartieren met
home/business-, seizoens-, werkdag/weekend- en zonnepatronen. De afzonderlijke
import- en exportreeksen sommeren exact naar de opgeloste jaartotalen.

Beide gemiddelde stromen kunnen binnen één kwartier voorkomen. Om de bekende
jaartotalen te behouden wordt het profiel niet achteraf genetteerd. De batterij
kan uitsluitend het **netto overschot of tekort** gebruiken: geen simultaan
laden/ontladen en geen batterijwinst uit overlap. De overlap wordt ook niet als
extra direct eigen verbruik gerapporteerd. Dit is een conservatieve benadering;
zonder gemeten kwartieren is de echte overlap onbekend.

Voor P50/P75/P90 loopt een theoretische verliesloze opslag chronologisch door
iedere kalenderdag. Netto export vult die opslag; uitsluitend latere netto import
kan deze benutten. De voorraad begint iedere dag op nul. Dit meet dezelfde dag
bruikbare zonne-export, zonder productspecifieke capaciteit. Percentielen gebruiken
nearest rank. Werkelijke batterijsimulatie mag wel energie naar de volgende dag
meenemen.

De praktische grens is `P90 / bruikbareFractie × 1,25`. Alle catalogusopties tot
die grens en de twee eerstvolgende opties worden doorgerekend. Bij nul P90 of
nul bruikbare capaciteit is de set leeg. De kleinste capaciteiten die 80%, 90% en
95% van de maximale `annualGridImportReductionKwh` binnen deze set bereiken zijn
conservatief, aanbevolen en ruim. Marginale winst is extra importreductie ten
opzichte van de vorige optie, ook per extra kWh capaciteit.

## Batterijphysics en productsheets

Technische simulatie: uitsluitend zonladen, productspecifieke vermogenslimieten,
10% minimum-SOC plus eventuele noodreserve en sqrt(round-trip rendement) aan
beide kanten. Twee herhaalde jaren; jaar 1 is warm-up en alleen jaar 2 wordt
gerapporteerd. Energiebehoud: lading = levering + verlies + eind-SOC − begin-SOC.
Cycli = ontladen energie aan batterijzijde / bruikbare capaciteit.

Brochure-audit (lokale `public/assets`, pagina 2):

| Catalogus kWh | Capaciteit / laden / ontladen | Rendement in model | Onderbouwing |
| --- | --- | --- | --- |
| 64 | 64,3 kWh / 32 kW / 30 kW | 90% aanname | ES64/30K-A/EU; 0,5P, AC-uitgang 30 kW; geen rendement vermeld |
| 96 | 96,46 kWh / 48 kW / 48 kW | 90% aanname | ES96/48K-A/EU; geen rendement vermeld |
| 232 | 232 kWh / 115 kW / 115 kW | 90% | ES232/115K-A/EU; capaciteit afgerond van 232,96; Max. Efficiency |
| 261 | 261,24 kWh / 125 kW / 125 kW | 90% | ESS261/125K-A/EU; Max. Efficiency |
| 2090 | 2090 kWh / 1000 kW / 1000 kW | 90% | ES2090/1000K-A/EU; Max. Efficiency |
| 5015 | 5015,88 kWh / 2580 kW / 2580 kW | 88% | ES5015/2580K-C/EU; Max. Efficiency |

De bestaande interpretatie van `Max. Efficiency` als systeemrendement blijft
behouden, zichtbaar als aanname; de brochure specificeert geen testcondities voor
round-trip prestaties. Deze waarden zijn geen veldmeting of prestatiegarantie.
De bestaande grotere-systeemparameters zijn numeriek behouden om kwartierdata
en peak-shaving niet onnodig te wijzigen.

De stackbrochure `2.5_22.5.pdf` vermeldt 7,68/10,24/12,8/15,36/17,92/20,48/23,04
kWh, modules van 51,2 V/50 Ah, 3–9 lagen en maximaal 50 A continu. Dat beschrijft
DC-batterijmodules, geen AC-omvormer of systeemrendement. 30/40.pdf zijn expliciete
placeholders. Deze negen opties behouden 0,5C/90% fallback. Ook 64/96 worden wegens
hun ontbrekende rendement als gedeeltelijke fallback gemarkeerd. Een aanbevolen
fallback-product geeft altijd confidence `low` en een expliciete waarschuwing.

Jaarnota-confidence is maximaal `medium`: betrouwbare energie, representatieve
periode/jaarwaarden, expliciet gekozen profiel en gedocumenteerde productspecs.
Defaultprofiel, sterke annualisering, bevestigde billing, onzekere extractie en
fallback-specs beperken dit tot `low`. Onbruikbare kernenergie geeft
`insufficient_data`, geen aanbevolen product.

## Afzonderlijke financiële berekening

Vast/variabel: importreductie × importprijs − exportreductie × terugleverprijs.
Ontbrekende tarieven gebruiken expliciet informatieve defaults; dit verandert
geen technische resultaten. Investeringsramingen zijn legacy en geen offerte.
Een enkele offerte is alleen geldig voor de expliciet gekoppelde capaciteit.

Dynamisch blijft voorlopig een apart legacy handelsmodel met 8.760 uurprijzen,
0,5C, 95% rendement, noodreserve, zon-/netladen en maximaal 24 uur vooruitkijken.
Het technische model bepaalt eerst onafhankelijk de kandidaten en capaciteit.
Het financiële model rapporteert historische kostenverschillen, gemiste export,
netladen en eigen cycli afzonderlijk van technische resultaten.

De worker probeert de laatste 365 volledige UTC-dagen via EnergyZero te laden.
Onvolledige of onbereikbare prijzen blokkeren het technische advies niet: het
rapport vermeldt dan dat alleen indicatieve gemiddelde tarieven zijn gebruikt.
Tariefcomponenten: `(marktprijs + opslag + energiebelasting excl. btw) × btw-factor`
en `(marktprijs − inhouding) × btw-factor`. Ontbrekende componenten zijn expliciet
gemelde nul-aannames; btw wordt niet dubbel toegepast.

De financiële marge ±25% is geen statistisch betrouwbaarheidsinterval. Saldering,
vaste terugleverkosten, onderhoud, degradatie, financiering, aansluiting en echte
piekbelasting zijn niet gemodelleerd. Kwartierdata en een installatiecontrole
blijven nodig voor definitieve dimensionering.
