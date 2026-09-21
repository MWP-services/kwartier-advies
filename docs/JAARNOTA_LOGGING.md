# Jaarnota-analyse volgen

Alle nieuwe workflowlogs beginnen met `[annual-bill]` en bevatten JSON met een tijdstip, `event` en `traceId`. Dezelfde trace-ID volgt de nota van upload tot rapport; de analysejob voegt zijn `jobId` toe. Handmatige invoer krijgt ook een trace-ID.

- Browser: open F12 → Console, schakel Info/Warnings/Errors in en filter op `[annual-bill]`. Zet Preserve log aan om logs bij navigatie te behouden.
- Lokaal: bekijk daarnaast de terminal waarin de app draait.
- Azure: bekijk de server-/applicatielogs van de webapp en zoek op `[annual-bill]` of een specifieke trace-ID. De volledige AI- en rekenstappen draaien op de server; de browser toont de voortgang en samenvatting.

## Verwachte volgorde

1. `browser.upload.started`, `upload.received`, `upload.validated`.
2. `pdf.text.started/completed`: PDF-grootte, tekstlengte en tijdsduur.
3. `rules.completed`: gevonden velden, numerieke waarden, zekerheid en bron.
4. `ai.request.started`: model, aangeboden tekstlengte en eventuele afkapping.
5. `ai.response.received`: HTTP-status, OpenAI request-ID en duur.
6. `ai.extraction.completed`: tokengebruik, herkende velden, broncontrolewaarschuwingen en velden die controle nodig hebben.
7. `merge.completed`: aanvullingen door AI, conflicterende velden en de geselecteerde waarden.
8. `extraction.completed`, `browser.extraction.ready`: AI-status, validatiepunten en gegevens voor de invoervelden.
9. `browser.input.changed`: handmatig aangepaste velden.
10. `browser.analysis.requested`, `analysis.queued`, `analysis.worker.started`: invoer en job-ID.
11. `calculation.inputs_resolved`: oorspronkelijke en gebruikte waarden, geschatte ontbrekende totalen en tarieffallbacks.
12. `calculation.synthetic_profile`: het interne compatibiliteitsprofiel is nadrukkelijk geen gemeten kwartierdata.
13. `calculation.ranking`, `calculation.completed`: aannames, scores, batterijopties, aanbevolen capaciteit, besparing en terugverdientijd.
14. `analysis.completed`, `browser.analysis.ready`.
15. `report.started`, `report.brochure.selected`, `report.completed`, `browser.report.downloaded`.

Handmatige invoer begint bij stap 9/10; daarbij wordt geen AI aangeroepen.

## AI beoordelen

`aiEnabled: true` betekent alleen dat een sleutel aanwezig is. Een geslaagde AI-extractie heeft ook `ai.response.received` met HTTP 200, `ai.extraction.completed` en `aiUsed: true` in `extraction.completed`. Dit bewijst niet dat alle waarden inhoudelijk correct zijn: controleer aantallen herkende velden, zekerheid, `requiresReview`, broncontrolewaarschuwingen en conflicten. Vergelijk de numerieke waarden uit `rules.completed`, `ai.extraction.completed` en `merge.completed`.

- `ai.skipped`: geen API-sleutel ingesteld.
- `ai.request.failed`: mislukking met fase (`http_request`, `response_json`, `structured_output` of `evidence_validation`). Bij een HTTP-fout staat de status in `ai.response.received`.
- `ai.http_error`: HTTP-status en, indien beschikbaar, een korte API-foutcode zoals `invalid_api_key`. De ruwe foutresponse wordt niet gelogd.
- `ai.fallback_to_rules`: AI is mislukt; de app gaat verder met de regelparser.
- `upload.rejected/failed`, `calculation.rejected/failed`, `analysis.failed`, `report.failed`: de betreffende stap is niet voltooid.

De logs bevatten energievolumes en tarieven, maar geen API-sleutels, autorisatieheaders, namen, EAN, volledige PDF-tekst, AI-proza of ruwe foutresponses. Polling wordt alleen bij status-/voortgangswijzigingen gelogd.

## Tarieven en kolomtabellen controleren

- `rules.candidate.accepted/rejected`: veld, herkend label, tekstregelnummer, getal, eenheid, eventuele expliciete centconversie en reden. Tarieven vereisen een kWh-prijseenheid; een willekeurig eurobedrag is onvoldoende.
- `rules.field.ambiguous`: meerdere verschillende waarden; de eenvoudige parser kiest niet willekeurig de eerste.
- `rules.table.detected`: aantallen factuurregels en hoeveelheden, plus het aantal mogelijke kolomkoppelingen.
- `rules.table.row_checked`: periode, kWh, tarief, regelbedrag en verschil tussen kWh × tarief en het regelbedrag. De kolomtabel wordt alleen gebruikt bij één eenhedenkoppeling en controleerbare positieve energieregels (maximaal 2 cent afrondingsverschil).
- `rules.table.completed/rejected`: de gewogen periodetarieven of de reden waarom koppeling niet betrouwbaar genoeg is. Leveringsregels worden als `supply_only` gemarkeerd; onderbouwde energiebelasting en btw worden daarna apart samengesteld.
- `compensatedFeedInKwh` is het volume bij terugleververgoeding, niet de fysieke teruglevering. Nul vergoeding vervangt nooit de fysieke teruglevering; apart gevonden teruglevervolumes blijven behouden. Tarieven worden gewogen met de hoeveelheden van de gecontroleerde factuurregels (`weightSource: billed_tariff_rows`).
- `normalization.tariff.rejected`, `merge.ai_tariff.rejected`, `calculation.tariff.rejected`: een onbruikbare prijs wordt tegengehouden, ook bij oude invoer of hoge AI-zekerheid. Het controlebereik voor jaargemiddelden is -2 tot 2 EUR/kWh; dit is een technische controlegrens, geen marktgrens. Geen automatische deling door 100 zonder expliciete cent-eenheid.
- `normalization.completed`: expliciet jaartotaal versus som van normaal/dal en expliciete nul-teruglevering.
- `pricing.resolved`, `calculation.prices_used`: de werkelijk gebruikte prijs en de herkomst (gewogen normaal/dal, enkel tarief of expliciete fallback). Deze prijs wordt ook in scherm en rapport gebruikt.
- `browser.input.replaced`: een nieuwe nota vervangt de oude invoer, zodat afgewezen/ontbrekende tarieven niet uit de vorige nota blijven staan.

`credit_balance_exhausted` betekent in de foutresponse dat OpenAI geen beschikbaar API-tegoed meldt. De app toont nu expliciet dat AI niet is gebruikt. Extra parserlogs verhelpen dit tegoedprobleem niet.

## Energiebelasting en btw

`tax.table.detected`, `tax.row.checked` en `tax.table.completed/rejected` tonen de stroombelastingregels per periode/schijf en controleren hoeveelheid × tarief tegen het regelbedrag. Gasbelasting, vermindering energiebelasting en netbeheer tellen niet mee in de variabele stroombelasting per kWh. Het totale btw-bedrag voor stroom én gas wordt niet gebruikt als btw voor alleen stroom.

`tax.metadata.resolved` toont het btw-percentage en of onderdelen inclusief/exclusief btw zijn. `pricing.resolved` bevat onder `components` de leveringsprijs, energiebelasting en toegevoegde btw op beide onderdelen. Een expliciet volledig inclusief tarief (`all_in`) krijgt geen extra opslag. Ontbrekende onderdelen worden gemeld onder `missingComponents`; er worden geen wettelijke tarieven geraden. De percentages en belastingbedragen komen uit de nota.

De AI-extractie ondersteunt dezelfde componenten. `merge.verified_tax_component.retained` meldt wanneer AI afwijkt van de gecontroleerde factuurregels: de gecontroleerde waarde blijft dan behouden.
