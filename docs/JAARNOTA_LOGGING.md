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
