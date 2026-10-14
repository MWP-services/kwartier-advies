import { parseBillNumber } from './numbers';
import type { EnergyPair } from './energyBasis';
import type { AnnualBillRawExtract } from './schema';

export type MeterEnergyRow = {
  connection: string; meter: string; register: string; direction: 'import' | 'export';
  periodStart: string; periodEnd: string; startReading: number; endReading: number;
  factor: number; quantityKwh: number; evidence: string;
};
const DATE = /\b\d{2}-\d{2}-\d{4}\b/g;
const iso = (date: string) => date.split('-').reverse().join('-');
const validDate = (date: string) => Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
const LABEL = /(?:stroom|elektriciteit|gas)\s+(?:(?:teruglevering|afname|levering|normaaltarief|daltarief|enkeltarief|normaal|dal|totaal)\s*)*\((?:kWh|m3|m³)\)/gi;
const HEADER = /(?:Verbruik|Energietype|Register)\s+Meternummer\s+(?:Van|Begindatum)\s+(?:Tot|Einddatum)\s+Beginstand\s+Eindstand\s+Factor\s+Verbruik/gi;

/** Reading precision: at most half a printed unit per reading, scaled by factor,
 * plus half a printed consumption unit. No percentage tolerance on large totals. */
const precision = (token: string) => /,\d+$/.test(token) ? 10 ** -token.split(',')[1].length : 1;

export function validateMeterEnergyRows(rows: MeterEnergyRow[]): { pair?: EnergyPair; conflicts: string[] } {
  const conflicts: string[] = [];
  const unique = [...new Map(rows.map(row => [JSON.stringify([row.connection, row.meter, row.register, row.direction, row.periodStart, row.periodEnd, row.startReading, row.endReading, row.factor, row.quantityKwh]), row])).values()];
  if (!unique.length) return { conflicts };
  if (new Set(unique.map(r => r.connection)).size !== 1 || new Set(unique.map(r => r.meter)).size !== 1) {
    return { conflicts: ['Meerdere elektriciteitsaansluitingen of meters gevonden; selecteer en bevestig één fysieke energiegrondslag.'] };
  }
  const groups = new Map<string, MeterEnergyRow[]>();
  for (const row of unique) {
    const key = `${row.direction}:${row.register}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const periods: string[] = [];
  for (const [register, group] of groups) {
    group.sort((a, b) => a.periodStart.localeCompare(b.periodStart));
    for (let i = 1; i < group.length; i++) {
      const previous = group[i - 1]; const row = group[i];
      if (row.periodStart < previous.periodEnd) conflicts.push(`Overlap of tegenstrijdige dubbele rij in meterregister ${register}.`);
      if (row.periodStart > previous.periodEnd) conflicts.push(`Ontbrekende deelperiode in meterregister ${register}.`);
      if (row.periodStart === previous.periodEnd && Math.abs(row.startReading - previous.endReading) > 1) conflicts.push(`Niet-aansluitende meterstanden in register ${register}.`);
    }
    periods.push(`${group[0].periodStart}/${group.at(-1)!.periodEnd}`);
  }
  if (new Set(periods).size !== 1) conflicts.push('Afname- en terugleverregisters bestrijken niet dezelfde volledige periode.');
  const imports = unique.filter(r => r.direction === 'import'); const exports = unique.filter(r => r.direction === 'export');
  if (!imports.length || !exports.length) conflicts.push('Fysieke metergegevens missen afname of teruglevering; ontbrekende teruglevering is geen nul.');
  for (const direction of ['import', 'export']) {
    const registers = [...groups.keys()].filter(key => key.startsWith(direction + ':')).map(key => key.split(':')[1]);
    if (registers.includes('normal') !== registers.includes('offPeak') || (registers.includes('total') && registers.length > 1)) conflicts.push(`Onvolledige of overlappende registerset voor ${direction}.`);
  }
  if (conflicts.length) return { conflicts: [...new Set(conflicts)] };
  const [periodStart, periodEnd] = periods[0].split('/');
  return { conflicts, pair: { gridImportKwh: imports.reduce((s, r) => s + r.quantityKwh, 0), gridExportKwh: exports.reduce((s, r) => s + r.quantityKwh, 0),
    periodStart, periodEnd, periodEndInclusive: false, annualized: false, extractionConfidence: 0.95,
    connectionId: unique[0].connection, meterId: unique[0].meter,
    registers: Object.fromEntries([...groups].map(([key, group]) => [key, group.reduce((s, r) => s + r.quantityKwh, 0)])),
    evidence: unique.map(r => r.evidence).join('\n') } };
}

/** Accept only a recognizable column schema, explicit factor and checked arithmetic.
 * Handles wrapped row labels/IDs and fully column-ordered text, without supplier names.
 * Reading dates are boundaries (exclusive end), not an inclusive invoice date range.
 */
export function extractMeterTable(text: string): AnnualBillRawExtract {
  const headers = [...text.matchAll(HEADER)];
  const rows: MeterEnergyRow[] = []; const problems: string[] = [];
  for (let table = 0; table < headers.length; table++) {
    const header = headers[table];
    const preceding = text.slice(Math.max(text.lastIndexOf('--', header.index), 0), header.index);
    if (/historisch(?:e)?\s+(?:meter|verbruik)|meter(?:standen)?\s+vorig\s+jaar/i.test(preceding)) continue;
    const connections = [...preceding.matchAll(/EAN(?:-code)?\s*(?:Stroom|Elektriciteit)\s*:?\s*(\d{18})/gi)].map(m => m[1]);
    if (new Set(connections).size > 1) problems.push('Meerdere elektriciteitsaansluitingen boven dezelfde meterstandentabel.');
    const connection = connections.at(-1) ?? 'document-electricity';
    const section = text.slice(header.index! + header[0].length, headers[table + 1]?.index ?? text.length);
    // Footnote definitions and following financial/summary sections are not table rows.
    const stop = section.search(/\n\s*(?:\d+\s+Deze stand|(?:\d+\s+)?[^\n]*Verbruik\s+Tarief\s+Bedrag|Levering van stroom|Product\s+Deze periode|-- \d+ of \d+ --)/i);
    const body = stop < 0 ? section : section.slice(0, stop);
    const noteIds = [...section.matchAll(/(?:^|\n)\s*(\d+)\s+Deze stand/g)].map(m => m[1]);
    const labels = [...body.matchAll(LABEL)];
    if ([...body.matchAll(/\b(?:stroom|elektriciteit|gas)\s+(?=[a-z(])/gi)].length !== labels.length) problems.push('Niet alle energieregisters in de meterstandentabel zijn herkend; controleer de volledige tabel.');
    if (!labels.length) { problems.push('Meterstandentabel herkend, maar energieregisters konden niet worden gekoppeld.'); continue; }
    const parse = (label: string, meter: string, start: string, end: string, cells: string[]) => {
      if (/gas|m3|m³/i.test(label)) return;
      const register = /normaal/i.test(label) ? 'normal' : /dal/i.test(label) ? 'offPeak' : 'total';
      const direction = /teruglevering/i.test(label) ? 'export' : 'import';
      let explicitNote = false;
      cells = cells.map((cell, i) => {
        const marker = i < 2 ? cell.match(/^(.*?)([¹²³])$/) : null;
        const note = marker ? String('¹²³'.indexOf(marker[2]) + 1) : undefined;
        if (marker && note && noteIds.includes(note)) { explicitNote = true; return marker[1]; }
        return cell;
      });
      // Superscript/explicit footnotes may be removed only with a matching definition.
      if (cells.length === 5 && noteIds.includes(cells[2])) cells = [cells[0], cells[1], cells[3], cells[4]];
      else if (!explicitNote && cells.length === 4 && noteIds.includes(cells[2])) {
        problems.push(`Factor of voetnoot is niet eenduidig in ${direction}:${register}; controleer de rij.`); return;
      }
      if (cells.length !== 4 || cells.some(x => !/^\d+(?:[.,]\d+)*$/.test(x)) || !meter) {
        problems.push(`Onvolledige meterstandrij ${direction}:${register}: controleer meter, standen, factor en verbruik.`); return;
      }
      const [startReading, endReading, factor, quantityKwh] = cells.map((x, i) => parseBillNumber(x, i === 2));
      const periodStart = iso(start); const periodEnd = iso(end);
      if ([startReading, endReading, factor, quantityKwh].some(x => x == null || !Number.isFinite(x) || x < 0) || !(factor! > 0)
        || !validDate(periodStart) || !validDate(periodEnd) || periodStart >= periodEnd
        || endReading! < startReading!
        || Math.abs((endReading! - startReading!) * factor! - quantityKwh!) > (precision(cells[0]) + precision(cells[1])) * factor! / 2 + precision(cells[3]) / 2 + 1e-9) {
        problems.push(`Meterstandberekening of periode klopt niet voor ${direction}:${register} (${periodStart} tot ${periodEnd}).`); return;
      }
      rows.push({ connection, meter, register, direction, periodStart, periodEnd, startReading: startReading!, endReading: endReading!, factor: factor!, quantityKwh: quantityKwh!,
        evidence: `${label.replace(/\s+/g, ' ')} ${periodStart} tot ${periodEnd}: (${endReading} - ${startReading}) × ${factor} = ${quantityKwh} kWh` });
    };
    const firstDate = body.search(DATE);
    if (labels.length > 1 && labels.at(-1)!.index! < firstDate) {
      // Column order must have exactly N meter IDs, 2N dates and 4N/5N numbers.
      const count = labels.length; const lastLabel = labels.at(-1)!;
      const meters = body.slice(lastLabel.index! + lastLabel[0].length, firstDate).trim().split(/\s+/);
      const tail = body.slice(firstDate); const dates = [...tail.matchAll(DATE)];
      const lastDate = dates.at(-1);
      const cells = lastDate ? tail.slice(lastDate.index! + lastDate[0].length).trim().split(/\s+/) : [];
      if (meters.length !== count || dates.length !== count * 2 || ![count * 4, count * 5].includes(cells.length)) {
        problems.push('Kolomgewijze meterstandentabel heeft ontbrekende of dubbelzinnige kolommen.'); continue;
      }
      for (let i = 0; i < count; i++) parse(labels[i][0], meters[i], dates[i][0], dates[count + i][0], Array.from({ length: cells.length / count }, (_, c) => cells[c * count + i]));
    } else {
      for (let i = 0; i < labels.length; i++) {
        const label = labels[i]; const chunk = body.slice(label.index! + label[0].length, labels[i + 1]?.index ?? body.length).trim();
        const dates = [...chunk.matchAll(DATE)];
        if (dates.length !== 2) { if (!/gas/i.test(label[0])) problems.push('Meterstandrij mist een eenduidige begin- of einddatum.'); continue; }
        const meter = chunk.slice(0, dates[0].index).replace(/\s+/g, '');
        parse(label[0], meter, dates[0][0], dates[1][0], chunk.slice(dates[1].index! + dates[1][0].length).trim().split(/\s+/));
      }
    }
  }
  const result = validateMeterEnergyRows(rows);
  const conflicts = [...new Set([...problems, ...result.conflicts])];
  if (conflicts.length) return { energyConflicts: { value: 'physical_meter_conflict', confidence: 0, source: 'rules', requiresReview: true, energyConflicts: conflicts } };
  return result.pair ? { physicalEnergy: { value: 'physical_meter', confidence: 0.95, source: 'rules', energyPair: result.pair, evidenceSnippet: result.pair.evidence } } : {};
}
