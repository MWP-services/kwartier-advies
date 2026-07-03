# Asynchrone analysejobs op Azure Web App

## Architectuur

De analyse draait asynchroon om Azure HTTP-timeouts bij grote datasets te vermijden.

1. `POST /api/analyze` valideert de aanvraag, schrijft een jobbestand en geeft snel `202 Accepted` terug.
2. De browser pollt `GET /api/analyze/status?jobId=...` voor dezelfde job.
3. Een apart langlopend Node-proces claimt jobs uit de gedeelde jobstore en voert de analyse uit.
4. Bij `completed` bevat de statusresponse het compacte analyseresultaat.

Dit is bedoeld voor een normale Azure App Service/Web App, niet voor Azure Static Web Apps. De productie-start is:

```bash
npm start
```

`npm start` voert `scripts/start-webapp.js` uit. Die start twee child-processen met dezelfde Node-runtime:

- Next.js webserver op `0.0.0.0:${PORT || 8080}`;
- analyseworker uit `.worker-build/worker/analysis-worker.js`.

De startfile stopt met exitcode 1 als de workerbuild ontbreekt. Zo draait Azure nooit stilletjes een website zonder worker.

## Build en deployment

Gebruik:

```bash
npm ci
npm test -- --run tests/analysisJobClient.test.ts tests/analysisJobs.test.ts
npm run build
node --check scripts/start-webapp.js
test -f .worker-build/worker/analysis-worker.js
```

`npm run build` voert eerst `next build` uit en daarna `tsc -p tsconfig.worker.json`.

De Azure Web App workflow `main_kwartier.yml` deployt de productieapp `kwartier` met een standalone Next.js zip. Die zip bevat minimaal:

- `server.js` en de standalone runtime uit `.next/standalone`;
- `.next/static`;
- `public`;
- `.worker-build`;
- `scripts/start-webapp.js`;
- `package.json` met `start: node scripts/start-webapp.js`.

De oude Azure Static Web Apps workflows staan alleen nog op `workflow_dispatch` en deployen niet meer automatisch op `push` of `pull_request`.

## Persistente jobstore

Jobs worden als JSON-bestanden opgeslagen via `FileAnalysisJobStore`.

Padvoorkeur:

1. `ANALYSIS_JOB_STORE_DIR`;
2. op Azure App Service: `/home/data/kwartieradvies/analysis-jobs`;
3. lokaal: `.analysis-jobs`.

Aanbevolen App Service setting:

```text
ANALYSIS_JOB_STORE_DIR=/home/data/kwartieradvies/analysis-jobs
```

Schakel ook **Always On** in op de Azure Web App. Zonder Always On kan Azure de app laten slapen, waardoor de worker stopt tot de volgende koude start.

## Worker heartbeat en health

De worker schrijft iedere 15 seconden een klein heartbeatbestand in de jobstore met:

- timestamp;
- PID;
- worker role;
- jobstore-pad.

Controle:

```http
GET /api/analyze/health
```

Online voorbeeld:

```json
{
  "healthy": true,
  "workerStatus": "online",
  "lastHeartbeatAt": "2026-07-03T14:00:00.000Z",
  "jobStoreDir": "/home/data/kwartieradvies/analysis-jobs",
  "ageMs": 1234
}
```

Bij ontbrekende, verlopen of corrupte heartbeat geeft het endpoint `503` met `healthy: false` en `workerStatus: "offline"`.

## Verwachte Log Stream

Bij een gezonde start:

```text
[webapp] starting analysis worker
[webapp] starting Next.js
[analyze-worker] starting
[analyze-worker] ready
```

Bij een analyse:

```text
[analyze] start request received
[analyze] start job stored
[analyze] job=<id> worker claimed job
[analyze] job=<id> status=processing
[analyze] job=<id> completed
```

Bij falen wordt de foutstack gelogd. Logs bevatten wel job-ID, attempts, statusovergangen, rijenaantal en stapduur, maar geen volledige dataset of klantgegevens.

## Polling versus jobs aanmaken

`POST /api/analyze` maakt een nieuwe job aan. `GET /api/analyze/status?jobId=...` maakt geen nieuwe job aan; dat is alleen polling op dezelfde `jobId`.

De frontend pollt begrensd:

- maximaal 5 minuten in `queued`;
- maximaal 20 minuten totaal;
- `completed` en `failed` blijven terminale statussen;
- abort via `AbortController` blijft werken.

Als een job te lang `queued` blijft, ziet de gebruiker een melding dat de analyseworker mogelijk niet draait of de jobstore niet kan bereiken.

## Stale locks

Bij het claimen maakt de worker atomisch een `.lock`-map naast het jobbestand. Een recente lock wordt nooit gestolen. Een lock ouder dan 30 minuten wordt als stale beschouwd en veilig verwijderd, zowel voor `queued` als voor verlopen `processing` jobs. Cleanup-acties worden gelogd:

```text
[analyze] jobstore removed stale lock
```

Veilige handmatige cleanup:

1. Controleer eerst `/api/analyze/health`.
2. Controleer in Log Stream of er geen actieve worker net dezelfde job verwerkt.
3. Verwijder alleen `.lock`-mappen ouder dan 30 minuten.
4. Verwijder geen `.json` jobbestanden tenzij je bewust oude jobs opruimt.

## Diagnose bij `queued`

Als een job op `queued` / `progress: 0` blijft:

1. Controleer Log Stream op `[webapp] starting analysis worker`.
2. Controleer Log Stream op `[analyze-worker] ready`.
3. Open `GET /api/analyze/health`.
4. Controleer dat `.worker-build/worker/analysis-worker.js` in de deployment zit.
5. Controleer dat `ANALYSIS_JOB_STORE_DIR` naar `/home/data/kwartieradvies/analysis-jobs` wijst of dat de standaard `/home` jobstore gebruikt wordt.
6. Controleer of Always On is ingeschakeld.
7. Zoek op `[analyze] job=<jobId>` en kijk of `worker claimed job` verschijnt.
8. Verschijnt alleen `start job stored`, dan draait de worker niet of ziet hij een andere jobstore.
