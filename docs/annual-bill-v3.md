# Batterijadvies V3 - validatie en aannames

## Methode

Ruim is de standaard (95%); Compact richt op 90% en Toekomstgericht op 97%. Selectie gebruikt het gemiddelde van drie fysiek gesimuleerde scenarios, zonder financiele parameters. Alle catalogusopties binnen drie gemiddelde dagen van de kleinste fysieke energiestroom (gedeeld door bruikbaar aandeel) worden onderzocht. P50/P75/P90 beschrijven de dagelijkse behoefte, maar begrenzen de uiteindelijke simulatie niet. Er wordt niet gestopt bij twee grotere buren.

De laatste twee opeenvolgende verbeteringen van het beste resultaat moeten elk maximaal 1% van het onderzochte maximum zijn om afvlakking betrouwbaar te noemen. Omdat alle relevante opties worden gesimuleerd, kan een tijdelijk slechter product latere verbeteringen niet verbergen. Ontbreekt afvlakking, dan wordt zekerheid laag en gelden percentages alleen binnen onderzochte opties.

Een stap omhoog vereist minimaal 50 kWh extra importreductie per jaar en minimaal 10 kWh/jaar per toegevoegde kWh capaciteit. Ruim/Toekomstgericht mogen nog een scenariostap nemen als een afzonderlijk scenario meer capaciteit vraagt: maximaal factor 1,5 en minstens 40 equivalente cycli. Deze grenzen zijn centraal instelbare kalibratieaannames, geen bewezen universele normen. Een procentdoel kan bewust niet worden gehaald als extra capaciteit onvoldoende nut heeft.

Profielen: woning, kantoor (business blijft alias), agrarisch, continu, maatwerk. Onbekend vergelijkt kantoor/continu/woning. Bekende profielen varieren avond/nachtgewichten met +/-25%, met behoud van fysieke jaartotalen. Maatwerk verdeelt dag/nacht binnen werkdagen en weekend als aandeel van de week. Toekomstgroei wordt alleen gebruikt bij expliciete extra jaarafname, maximaal 50%; grotere wijzigingen vragen afzonderlijke analyse. Tarieven zijn geen profielbewijs.

## V2 versus V3

V2 wordt hier gereproduceerd met de oude P90 x 1,25 / bruikbaar-aandeel grens, twee grotere opties en 90%-selectie, met dezelfde simulatiefysica. Voor nieuwe agrarische/continue profielen betreft V2 een vergelijking van de selectieregel; deze profielen bestonden nog niet in V2.

| Case | V2 kWh | Compact kWh | Ruim kWh | Maximum betrouwbaar |
|---|---:|---:|---:|---|
| Kleine woning | 7.68 | None | None | False |
| Gemiddelde woning | 7.68 | 7.68 | 7.68 | True |
| Hoge netafname woning | 12.8 | 12.8 | 15.36 | True |
| Eneco office | 12.8 | 40 | 40 | False |
| Eneco agricultural | 30 | 40 | 40 | False |
| Eneco continuous | 40 | 40 | 40 | False |
| Groot bedrijf | 2090 | 232 | 261 | False |

Bij het kleine huishouden (2000/300 kWh) past geen catalogusbatterij binnen de bovengrens. Dit betekent niet dat fysiek opslagpotentieel ontbreekt.

## Eneco: kandidaten

Fysiek 35.444/16.439 kWh over 363 dagen; eenmalige annualisatie 365/363. Netto 19.005 kWh wordt niet als fysieke afname gebruikt. Onderstaande reducties zijn het verwachte profiel, niet het scenariogemiddelde voor selectie.

### Eneco office

| Capaciteit kWh | Verwachte reductie kWh/jaar | Extra t.o.v. kleinere kWh/jaar | Dag / verwacht / avond-nacht kWh/jaar |
|---:|---:|---:|---|
| 7.68 | 1028.7 | 1028.7 | 966.5 / 1028.7 / 986.4 |
| 10.24 | 1128.1 | 99.4 | 1022.4 / 1128.1 / 1215.9 |
| 12.8 | 1210.1 | 82.0 | 1063.9 / 1210.1 / 1424.1 |
| 15.36 | 1264.2 | 54.1 | 1105.4 / 1264.2 / 1524.7 |
| 17.92 | 1305.8 | 41.5 | 1143.6 / 1305.8 / 1608.0 |
| 20.48 | 1346.0 | 40.3 | 1180.8 / 1346.0 / 1688.9 |
| 23.04 | 1383.3 | 37.3 | 1217.9 / 1383.3 / 1735.9 |
| 30 | 1484.4 | 101.0 | 1319.0 / 1484.4 / 1841.2 |
| 40 | 1629.5 | 145.1 | 1464.1 / 1629.5 / 1986.3 |
| 64 | 1786.6 | 157.1 | 1581.9 / 1786.6 / 2205.1 |
| 96 | 1814.0 | 27.5 | 1609.3 / 1814.0 / 2232.5 |

### Eneco agricultural

| Capaciteit kWh | Verwachte reductie kWh/jaar | Extra t.o.v. kleinere kWh/jaar | Dag / verwacht / avond-nacht kWh/jaar |
|---:|---:|---:|---|
| 7.68 | 1149.4 | 1149.4 | 1009.9 / 1149.4 / 1403.3 |
| 10.24 | 1483.8 | 334.4 | 1344.3 / 1483.8 / 1833.6 |
| 12.8 | 1818.3 | 334.4 | 1631.1 / 1818.3 / 2168.0 |
| 15.36 | 2152.7 | 334.4 | 1832.2 / 2152.7 / 2502.4 |
| 17.92 | 2487.1 | 334.4 | 2033.3 / 2487.1 / 2836.9 |
| 20.48 | 2811.5 | 324.4 | 2234.4 / 2811.5 / 3171.3 |
| 23.04 | 3012.6 | 201.1 | 2414.9 / 3012.6 / 3505.7 |
| 30 | 3559.3 | 546.7 | 2563.2 / 3559.3 / 4414.9 |
| 40 | 3887.4 | 328.0 | 2571.7 / 3887.4 / 5205.5 |
| 64 | 3908.1 | 20.7 | 2592.5 / 3908.1 / 5578.1 |
| 96 | 3935.6 | 27.5 | 2619.9 / 3935.6 / 5605.6 |

### Eneco continuous

| Capaciteit kWh | Verwachte reductie kWh/jaar | Extra t.o.v. kleinere kWh/jaar | Dag / verwacht / avond-nacht kWh/jaar |
|---:|---:|---:|---|
| 7.68 | 1235.0 | 1235.0 | 1015.9 / 1235.0 / 1406.4 |
| 10.24 | 1569.4 | 334.4 | 1350.3 / 1569.4 / 1874.1 |
| 12.8 | 1903.8 | 334.4 | 1684.7 / 1903.8 / 2286.2 |
| 15.36 | 2238.3 | 334.4 | 1950.5 / 2238.3 / 2620.6 |
| 17.92 | 2572.7 | 334.4 | 2151.6 / 2572.7 / 2955.1 |
| 20.48 | 2907.1 | 334.4 | 2352.6 / 2907.1 / 3289.5 |
| 23.04 | 3238.4 | 331.3 | 2553.7 / 3238.4 / 3623.9 |
| 30 | 3785.1 | 546.7 | 2928.5 / 3785.1 / 4533.1 |
| 40 | 4378.5 | 593.4 | 2937.0 / 4378.5 / 5468.2 |
| 64 | 4399.2 | 20.7 | 2957.7 / 4399.2 / 6081.3 |
| 96 | 4426.7 | 27.5 | 2985.2 / 4426.7 / 6108.8 |

## Energievalidatie en rapportage

Bestaande fysieke meterparen, registers, aansluitende deelperiodes, exclusieve einddatum, salderingsscheiding en conflictbevestiging blijven behouden. Twee gevonden fouten in bestaande lokale tests zijn hersteld: gas-meteridentificatie in kolomtabellen en CRLF in de gegenereerde PDF-fixture. UI en PDF lezen hetzelfde AnnualBillAdviceResult; de rapportgenerator selecteert geen batterij.

## Bestanden

- src/lib/annual-bill/sizingPolicy.ts: centrale grenswaarden.
- src/lib/annual-bill/calculateAnnualBillAdvice.ts: scenarioselectie, brede kandidaten, marginale toets, onzekerheid.
- src/lib/annual-bill/buildAnnualBillSyntheticProfile.ts: profielen en variaties.
- lib/analysis.ts en simulateDynamicAnnualBill.ts: backwards-compatible optionele types.
- app/page.tsx en lib/annualBillReportHtml.ts: invoer, onderbouwing en vergelijking.
- scripts/check-annual-bill-v3.ts en docs/annual-bill-v3-results.json: reproduceerbare vergelijking.
- tests/annualBillV3.test.ts en bestaande advies-/rapporttests: regressiecontroles.

Bij aanvang waren reeds lokale wijzigingen aanwezig in de meterextractie, energiegrondslag en presentatie. Deze zijn behouden; de branch bevat daardoor ook die vooraf bestaande werkzaamheden.

## Beperkingen

Synthetische import en export worden per kwartier gesaldeerd zoals in het bestaande model; de nota bepaalt hun werkelijke overlap niet. Geen gemeten piekvermogens, degradatie of seizoensopslag. Productspecificaties gebruiken bestaande catalogus/fallback-aannames. De fysieke grens kan bij een dunne catalogus geen bewezen maximum opleveren: dan volgt expliciet lage zekerheid, geen ongefundeerde 95%-claim. De scenarioband is geen statistisch betrouwbaarheidsinterval.

## Volledige jaarnota-regressietest

`tests/annualBillMeterPdf.integration.test.ts` maakt standaard een anonieme, tekstselecteerbare PDF met de Eneco-registerfixture en de gesimuleerde factuurregels. De test doorloopt PDF-tekstextractie, meterregisterherkenning, normalisatie, energiegrondslag, V3-advies en de gegevens in het jaarnota-rapport. De verwachte fysieke afname is 35.444 kWh en teruglevering 16.439 kWh; de netto gefactureerde afname van 19.005 kWh blijft apart en wordt niet als fysieke meterafname gebruikt. De periode is 01-10-2024 tot 29-09-2025 exclusief (363 dagen); alleen de fysieke jaargrondslag wordt met factor 365/363 geannualiseerd.

Er was tijdens deze validatie geen lokaal bestand ingesteld via `ANNUAL_BILL_PDF_FIXTURE`. Daarom is geen echte klantnota gebruikt of aan de repository toegevoegd. De aanvullende fixtures gebruiken testmeter-ID's en testwaarden; de kolomfixture is een geanonimiseerde tekstreproductie, geen originele PDF. `tests/annualBillMeterTable.test.ts` dekt ook ontbrekende/overlappende perioden, dubbele regels, factorproblemen, ontbrekende export, meerdere aansluitingen, salderingsverwarring en handmatige bevestiging na onbetrouwbare extractie.

Voer de relevante regressies lokaal uit met:

```sh
npm ci
npx vitest run tests/annualBillMeterPdf.integration.test.ts tests/annualBillMeterTable.test.ts tests/annualBillV3.test.ts
```

Met toestemming kan een ontwikkelaar tijdelijk een lokaal, beveiligd PDF-pad instellen voordat dezelfde PDF-test wordt gestart. Houd de PDF buiten de repository, zet het pad niet in CI, commit het bestand niet en wis de tijdelijke variabele direct daarna:

```powershell
$env:ANNUAL_BILL_PDF_FIXTURE = 'C:\secure\pad\naar\jaarnota.pdf'
npx vitest run tests/annualBillMeterPdf.integration.test.ts
Remove-Item Env:ANNUAL_BILL_PDF_FIXTURE
```

De reguliere GitHub Actions-validatie gebruikt Node.js 22 en draait `npm ci`, de volledige suite via `npm test`, `npm run typecheck` en `npm run lint`. Daarna bouwt een aparte job de productie-app en worker met `npm run build` en controleert de deploymentbundel. Deployment naar Azure Web App kan alleen na die jobs slagen en wordt alleen uitgevoerd bij een push naar `main` of handmatige start vanaf `main`; pull requests draaien controles maar deployen niet. De twee handmatige Azure Static Web Apps-workflows gebruiken dezelfde verplichte validatieworkflow als voorwaarde.

De PDF-extractie leest selecteerbare tekst met `pdf-parse`; ze voert geen OCR uit. Afwijkende kolomvolgorde, ontbrekende factoren, tegenstrijdige of overlappende meterregels en meerdere aansluitingen worden niet automatisch als fysieke energie geaccepteerd. Zulke documenten vereisen correctie/bevestiging in de invoer. Een lokale klantnota kan extra leveranciersspecifieke lay-outs blootleggen die de geanonimiseerde regressiefixtures niet afdekken.
