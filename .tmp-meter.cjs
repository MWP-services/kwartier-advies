"use strict";

// scripts/debug-v3-meter.ts
var import_node_fs = require("node:fs");
var import_pdf_lib = require("pdf-lib");
var import_pdf_parse = require("pdf-parse");

// src/lib/annual-bill/numbers.ts
var BILL_NUMBER_PATTERN = String.raw`[-+]?(?:\d{1,3}(?:[.\u00a0 ]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)`;
function parseBillNumber(value, decimalDot = false) {
  let normalized = value.replace(/\s/g, "");
  if (normalized.includes(",")) normalized = normalized.replace(/\./g, "").replace(",", ".");
  else if (!decimalDot && !/^[-+]?0\./.test(normalized)) normalized = normalized.replace(/\.(?=\d{3}(?:\D|$))/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

// src/lib/annual-bill/extractMeterTable.ts
var DATE = /\b\d{2}-\d{2}-\d{4}\b/g;
var iso = (date) => date.split("-").reverse().join("-");
var validDate = (date) => Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
var LABEL = /(?:stroom|elektriciteit|gas)\s+(?:(?:teruglevering|afname|levering|normaaltarief|daltarief|enkeltarief|normaal|dal|totaal)\s*)*\((?:kWh|m3|m³)\)/gi;
var HEADER = /(?:Verbruik|Energietype|Register)\s+Meternummer\s+(?:Van|Begindatum)\s+(?:Tot|Einddatum)\s+Beginstand\s+Eindstand\s+Factor\s+Verbruik/gi;
var precision = (token) => /,\d+$/.test(token) ? 10 ** -token.split(",")[1].length : 1;
function validateMeterEnergyRows(rows) {
  const conflicts = [];
  const unique = [...new Map(rows.map((row) => [JSON.stringify([row.connection, row.meter, row.register, row.direction, row.periodStart, row.periodEnd, row.startReading, row.endReading, row.factor, row.quantityKwh]), row])).values()];
  if (!unique.length) return { conflicts };
  if (new Set(unique.map((r) => r.connection)).size !== 1 || new Set(unique.map((r) => r.meter)).size !== 1) {
    return { conflicts: ["Meerdere elektriciteitsaansluitingen of meters gevonden; selecteer en bevestig \xE9\xE9n fysieke energiegrondslag."] };
  }
  const groups = /* @__PURE__ */ new Map();
  for (const row of unique) {
    const key = `${row.direction}:${row.register}`;
    groups.set(key, [...groups.get(key) ?? [], row]);
  }
  const periods = [];
  for (const [register, group] of groups) {
    group.sort((a, b) => a.periodStart.localeCompare(b.periodStart));
    for (let i = 1; i < group.length; i++) {
      const previous = group[i - 1];
      const row = group[i];
      if (row.periodStart < previous.periodEnd) conflicts.push(`Overlap of tegenstrijdige dubbele rij in meterregister ${register}.`);
      if (row.periodStart > previous.periodEnd) conflicts.push(`Ontbrekende deelperiode in meterregister ${register}.`);
      if (row.periodStart === previous.periodEnd && Math.abs(row.startReading - previous.endReading) > 1) conflicts.push(`Niet-aansluitende meterstanden in register ${register}.`);
    }
    periods.push(`${group[0].periodStart}/${group.at(-1).periodEnd}`);
  }
  if (new Set(periods).size !== 1) conflicts.push("Afname- en terugleverregisters bestrijken niet dezelfde volledige periode.");
  const imports = unique.filter((r) => r.direction === "import");
  const exports2 = unique.filter((r) => r.direction === "export");
  if (!imports.length || !exports2.length) conflicts.push("Fysieke metergegevens missen afname of teruglevering; ontbrekende teruglevering is geen nul.");
  for (const direction of ["import", "export"]) {
    const registers = [...groups.keys()].filter((key) => key.startsWith(direction + ":")).map((key) => key.split(":")[1]);
    if (registers.includes("normal") !== registers.includes("offPeak") || registers.includes("total") && registers.length > 1) conflicts.push(`Onvolledige of overlappende registerset voor ${direction}.`);
  }
  if (conflicts.length) return { conflicts: [...new Set(conflicts)] };
  const [periodStart, periodEnd] = periods[0].split("/");
  return { conflicts, pair: {
    gridImportKwh: imports.reduce((s, r) => s + r.quantityKwh, 0),
    gridExportKwh: exports2.reduce((s, r) => s + r.quantityKwh, 0),
    periodStart,
    periodEnd,
    periodEndInclusive: false,
    annualized: false,
    extractionConfidence: 0.95,
    connectionId: unique[0].connection,
    meterId: unique[0].meter,
    registers: Object.fromEntries([...groups].map(([key, group]) => [key, group.reduce((s, r) => s + r.quantityKwh, 0)])),
    evidence: unique.map((r) => r.evidence).join("\n")
  } };
}
function extractMeterTable(text) {
  const headers = [...text.matchAll(HEADER)];
  const rows = [];
  const problems = [];
  for (let table = 0; table < headers.length; table++) {
    const header = headers[table];
    const preceding = text.slice(Math.max(text.lastIndexOf("--", header.index), 0), header.index);
    if (/historisch(?:e)?\s+(?:meter|verbruik)|meter(?:standen)?\s+vorig\s+jaar/i.test(preceding)) continue;
    const connections = [...preceding.matchAll(/EAN(?:-code)?\s*(?:Stroom|Elektriciteit)\s*:?\s*(\d{18})/gi)].map((m) => m[1]);
    if (new Set(connections).size > 1) problems.push("Meerdere elektriciteitsaansluitingen boven dezelfde meterstandentabel.");
    const connection = connections.at(-1) ?? "document-electricity";
    const section = text.slice(header.index + header[0].length, headers[table + 1]?.index ?? text.length);
    const stop = section.search(/\n\s*(?:\d+\s+Deze stand|(?:\d+\s+)?[^\n]*Verbruik\s+Tarief\s+Bedrag|Levering van stroom|Product\s+Deze periode|-- \d+ of \d+ --)/i);
    const body = stop < 0 ? section : section.slice(0, stop);
    const noteIds = [...section.matchAll(/(?:^|\n)\s*(\d+)\s+Deze stand/g)].map((m) => m[1]);
    const labels = [...body.matchAll(LABEL)];
    if ([...body.matchAll(/\b(?:stroom|elektriciteit|gas)\s+(?=[a-z(])/gi)].length !== labels.length) problems.push("Niet alle energieregisters in de meterstandentabel zijn herkend; controleer de volledige tabel.");
    if (!labels.length) {
      problems.push("Meterstandentabel herkend, maar energieregisters konden niet worden gekoppeld.");
      continue;
    }
    const parse = (label, meter, start, end, cells) => {
      if (/gas|m3|m³/i.test(label)) return;
      const register = /normaal/i.test(label) ? "normal" : /dal/i.test(label) ? "offPeak" : "total";
      const direction = /teruglevering/i.test(label) ? "export" : "import";
      let explicitNote = false;
      cells = cells.map((cell, i) => {
        const marker = i < 2 ? cell.match(/^(.*?)([¹²³])$/) : null;
        const note = marker ? String("\xB9\xB2\xB3".indexOf(marker[2]) + 1) : void 0;
        if (marker && note && noteIds.includes(note)) {
          explicitNote = true;
          return marker[1];
        }
        return cell;
      });
      if (cells.length === 5 && noteIds.includes(cells[2])) cells = [cells[0], cells[1], cells[3], cells[4]];
      else if (!explicitNote && cells.length === 4 && noteIds.includes(cells[2])) {
        problems.push(`Factor of voetnoot is niet eenduidig in ${direction}:${register}; controleer de rij.`);
        return;
      }
      if (cells.length !== 4 || cells.some((x) => !/^\d+(?:[.,]\d+)*$/.test(x)) || !meter) {
        problems.push(`Onvolledige meterstandrij ${direction}:${register}: controleer meter, standen, factor en verbruik.`);
        return;
      }
      const [startReading, endReading, factor, quantityKwh] = cells.map((x, i) => parseBillNumber(x, i === 2));
      const periodStart = iso(start);
      const periodEnd = iso(end);
      if ([startReading, endReading, factor, quantityKwh].some((x) => x == null || !Number.isFinite(x) || x < 0) || !(factor > 0) || !validDate(periodStart) || !validDate(periodEnd) || periodStart >= periodEnd || endReading < startReading || Math.abs((endReading - startReading) * factor - quantityKwh) > (precision(cells[0]) + precision(cells[1])) * factor / 2 + precision(cells[3]) / 2 + 1e-9) {
        problems.push(`Meterstandberekening of periode klopt niet voor ${direction}:${register} (${periodStart} tot ${periodEnd}).`);
        return;
      }
      rows.push({
        connection,
        meter,
        register,
        direction,
        periodStart,
        periodEnd,
        startReading,
        endReading,
        factor,
        quantityKwh,
        evidence: `${label.replace(/\s+/g, " ")} ${periodStart} tot ${periodEnd}: (${endReading} - ${startReading}) \xD7 ${factor} = ${quantityKwh} kWh`
      });
    };
    const firstDate = body.search(DATE);
    if (labels.length > 1 && labels.at(-1).index < firstDate) {
      const count = labels.length;
      const lastLabel = labels.at(-1);
      const meters = body.slice(lastLabel.index + lastLabel[0].length, firstDate).trim().split(/\s+/);
      const tail = body.slice(firstDate);
      const dates = [...tail.matchAll(DATE)];
      const lastDate = dates.at(-1);
      const cells = lastDate ? tail.slice(lastDate.index + lastDate[0].length).trim().split(/\s+/) : [];
      if (meters.length !== count || dates.length !== count * 2 || ![count * 4, count * 5].includes(cells.length)) {
        problems.push("Kolomgewijze meterstandentabel heeft ontbrekende of dubbelzinnige kolommen.");
        continue;
      }
      for (let i = 0; i < count; i++) parse(labels[i][0], meters[i], dates[i][0], dates[count + i][0], Array.from({ length: cells.length / count }, (_, c) => cells[c * count + i]));
    } else {
      for (let i = 0; i < labels.length; i++) {
        const label = labels[i];
        const chunk = body.slice(label.index + label[0].length, labels[i + 1]?.index ?? body.length).trim();
        const dates = [...chunk.matchAll(DATE)];
        if (dates.length !== 2) {
          if (!/gas/i.test(label[0])) problems.push("Meterstandrij mist een eenduidige begin- of einddatum.");
          continue;
        }
        const meter = chunk.slice(0, dates[0].index).replace(/\s+/g, "");
        parse(label[0], meter, dates[0][0], dates[1][0], chunk.slice(dates[1].index + dates[1][0].length).trim().split(/\s+/));
      }
    }
  }
  const result = validateMeterEnergyRows(rows);
  const conflicts = [.../* @__PURE__ */ new Set([...problems, ...result.conflicts])];
  if (conflicts.length) return { energyConflicts: { value: "physical_meter_conflict", confidence: 0, source: "rules", requiresReview: true, energyConflicts: conflicts } };
  return result.pair ? { physicalEnergy: { value: "physical_meter", confidence: 0.95, source: "rules", energyPair: result.pair, evidenceSnippet: result.pair.evidence } } : {};
}

// scripts/debug-v3-meter.ts
(async () => {
  const pdf = await import_pdf_lib.PDFDocument.create();
  const font = await pdf.embedFont(import_pdf_lib.StandardFonts.Helvetica);
  pdf.addPage([700, 1500]).drawText((0, import_node_fs.readFileSync)("tests/fixtures/eneco-meter-registers.txt", "utf8"), { font, size: 10, x: 20, y: 1470, lineHeight: 12 });
  const parser = new import_pdf_parse.PDFParse({ data: await pdf.save() });
  const text = (await parser.getText()).text;
  (0, import_node_fs.writeFileSync)(".tmp-meter.txt", text);
  console.log(JSON.stringify(extractMeterTable(text)));
  await parser.destroy();
})();
