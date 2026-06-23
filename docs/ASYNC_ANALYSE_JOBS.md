# Asynchrone analysejobs

## Waarom dit bestaat

Azure App Service breekt langlopende HTTP-requests af na ongeveer 230 tot 240 seconden. De oude `POST /api/analyze`-route voerde de volledige kwartierdata-analyse binnen hetzelfde open request uit. Bij grote datasets bleef de browser daardoor minuten wachten en eindigde Azure met `504 Gateway Timeout`.

De analyse is nu job-gebaseerd:

1. `POST /api/analyze` valideert de invoer, maakt een job aan en antwoordt snel met `202 Accepted`.
2. Een worker verwerkt de analyse buiten het oorspronkelijke HTTP-request.
3. De frontend pollt `GET /api/analyze/status?jobId=...`.
4. Het eindresultaat wordt pas bij status `completed` teruggegeven.

## Endpoints

### Analyse starten

```http
POST /api/analyze
```

Succes:

```json
{
  "jobId": "analysis_abc123...",
  "status": "queued",
  "progress": 0,
  "currentStep": "Analyse staat in de wachtrij"
}
```

Statuscode: `202`.

### Status ophalen

```http
GET /api/analyze/status?jobId=analysis_abc123...
```

Mogelijke statussen:

- `queued`
- `processing`
- `completed`
- `failed`

Bij `completed` bevat de response het bestaande compacte analyseresultaat. Bij `failed` bevat de response een veilige foutmelding voor de gebruiker. De technische stacktrace staat alleen in de serverlogs en jobstore.

## Persistente opslag

Jobs worden opgeslagen als JSON-bestanden via `FileAnalysisJobStore`.

Padkeuze:

- `ANALYSIS_JOB_STORE_DIR`, indien gezet.
- Op Azure App Service: `$HOME/data/kwartieradvies/analysis-jobs`.
- Lokaal: `.analysis-jobs`.

Hierdoor verdwijnen jobs niet bij een normale Node-process restart. Gebruik op Azure App Service persistente `/home`-storage. Voor Linux/custom-container deployments hoort `WEBSITES_ENABLE_APP_SERVICE_STORAGE=true` aan te staan wanneer de App Service storage niet standaard gemount is.

Per job wordt opgeslagen:

- `jobId`
- status, voortgang en huidige stap
- aanmaak-, update-, start- en eindtijd
- veilige inputkopie, inclusief upload-rijen voor intervalanalyses
- resultaat bij succes
- veilige foutmelding en technische foutdetails bij falen

De `jobId` is een UUID-gebaseerde waarde met prefix `analysis_` en is niet eenvoudig te raden.

## Worker

Voor lokale development start `npm run dev` een eenvoudige in-process fallback-worker zodra een analysejob wordt aangemaakt of status wordt opgevraagd.

Voor Azure standalone deployment bouwt de workflow ook een aparte worker:

```bash
npm run build
npm run build:worker
```

De deploy-package start via:

```bash
node start.js
```

`start.js` doet twee dingen:

- zet `ANALYSIS_WORKER_DISABLE_IN_PROCESS=true`, zodat de webserver zelf geen analyses draait;
- start `.worker-build/worker/analysis-worker.js` als apart Node-proces naast `server.js`.

Als de worker onverwacht stopt, wordt hij na enkele seconden opnieuw gestart. Bij `SIGTERM` of `SIGINT` wordt de worker netjes afgesloten.

## Logging

Alle analysegerichte serverlogs gebruiken de prefix:

```text
[analyze]
```

De worker-starter gebruikt:

```text
[analyze-worker]
```

Geloggede stappen:

- request ontvangen
- JSON parsen
- inputvalidatie
- job opslaan
- job claimen door worker
- input verwerken
- kwartierdata voorbewerken
- berekeningen en simulaties uitvoeren
- resultaat opslaan
- response payload samenstellen
- totale verwerkingstijd
- volledige foutdetails bij falen

Log geen API-sleutels of volledige datasets in Azure Log Stream.

## Externe requests

De EnergyZero-prijsintegratie gebruikt expliciete time-outs en beperkte retries:

- standaard timeout: 30 seconden
- standaard maximaal 2 retries
- retries alleen bij `429`, `502`, `503` en `504`
- exponential backoff
- geen retries op permanente validatiefouten of gewone `4xx`-responses

## Environment variables

Aanbevolen Azure App Service settings:

```text
WEBSITES_ENABLE_APP_SERVICE_STORAGE=true
ANALYSIS_JOB_STORE_DIR=/home/data/kwartieradvies/analysis-jobs
```

`ANALYSIS_JOB_STORE_DIR` is optioneel zolang `$HOME` naar persistente App Service storage wijst. Zet hem wel expliciet als je het opslagpad voorspelbaar wilt houden.

De deployment-wrapper zet zelf:

```text
ANALYSIS_WORKER_DISABLE_IN_PROCESS=true
ANALYSIS_WORKER_ROLE=worker
```

Deze waarden hoef je normaal niet handmatig in Azure te zetten.

## Mislukte jobs onderzoeken

1. Zoek in App Service Log Stream op `[analyze] job=<jobId>`.
2. Controleer de stap waarop de job faalde.
3. Bekijk het jobbestand in `ANALYSIS_JOB_STORE_DIR` voor status, foutmelding en veilige technische details.
4. Controleer of de worker draait door te zoeken op `[analyze-worker] started`.

## Schaal en beperkingen

Deze implementatie is geschikt voor Azure App Service met persistente App Service storage en een standalone Node deployment. De file-locks voorkomen dat dezelfde job tegelijk door meerdere workerprocessen wordt verwerkt.

Bij agressieve scale-out, zeer hoge jobvolumes of meerdere App Service instances is Azure Storage Queue, Service Bus of Durable Functions de volgende stap. De code is daarvoor voorbereid met een `AnalysisJobStore`-abstractie, zodat de file store later vervangen kan worden zonder de frontendflow of API-contracten te wijzigen.
