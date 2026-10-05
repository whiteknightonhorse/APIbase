import type { SdnCsvRow, AltCsvRow } from '../adapters/ofac/types';

export const SDN_CSV_URL =
  'https://sanctionslistservice.ofac.treas.gov/api/publicationpreview/exports/sdn.csv';
export const ALT_CSV_URL =
  'https://sanctionslistservice.ofac.treas.gov/api/publicationpreview/exports/alt.csv';

const NULL_VAL = /^-0-\s*$/;

function normalise(v: string): string {
  return NULL_VAL.test(v) ? '' : v.trim().replace(/^"|"$/g, '');
}

/** Parse OFAC CSV (no header row, comma-separated, values may be quoted). */
export function parseOfacCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const fields: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        fields.push(normalise(cur));
        cur = '';
      } else {
        cur += ch;
      }
    }
    fields.push(normalise(cur));
    rows.push(fields);
  }
  return rows;
}

export function rowToSdn(f: string[]): SdnCsvRow {
  return {
    ent_num: parseInt(f[0] ?? '0', 10),
    sdn_name: f[1] ?? '',
    sdn_type: f[2] ?? '',
    program: f[3] ?? '',
    title: f[4] ?? '',
    call_sign: f[5] ?? '',
    voc_type: f[6] ?? '',
    tonnage: f[7] ?? '',
    grt: f[8] ?? '',
    vess_flag: f[9] ?? '',
    vess_owner: f[10] ?? '',
    remarks: f[11] ?? '',
  };
}

export function rowToAlt(f: string[]): AltCsvRow {
  return {
    ent_num: parseInt(f[0] ?? '0', 10),
    alt_num: parseInt(f[1] ?? '0', 10),
    alt_type: f[2] ?? '',
    alt_name: f[3] ?? '',
    alt_remarks: f[4] ?? '',
  };
}
