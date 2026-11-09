/**
 * Splits a printed ingredient list into ordered names. Keeps what is printed; only separators,
 * spacing, case and footnote marks are normalised. Anything after "may contain" / "+/-" (shade ranges)
 * is kept apart because it does not follow the descending-order rule.
 */
export interface ParsedList {
  items: string[];          // in printed order, normalised with normalizeName
  mayContain: string[];     // colourants listed after "may contain" / "+/-"
  raw: string;
}

const MAY_WORDS = '(?:may contain|peut contenir|kann enthalten|puede contener|içerebilir|قد يحتوي)';
const MAY_CONTAIN = new RegExp(`(?:\\[\\s*)?(?:(?:\\+\\/-|±|${MAY_WORDS})\\s*\\/?\\s*)+:?`, 'i');
const HEADER = /^\s*(?:ingredients?|inci|composition|bileşenler|i̇çindekiler|içindekiler|İçindekiler|İÇİNDEKİLER|المكونات)\s*[:\-–]?\s*/i;

export function normalizeName(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[*†‡§¹²³⁴⁵⁶⁷⁸⁹⁰]+/g, '')       // footnote marks
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, '')
    .trim()
    .toUpperCase();
}

/** Split on commas that are not inside parentheses or brackets ("PEG-40 HYDROGENATED CASTOR OIL (1,2)" stays whole). */
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if ((ch === ',' || ch === ';' || ch === '•' || ch === '·') && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseIngredientList(raw: string): ParsedList {
  const text = raw.replace(HEADER, '').replace(/\r?\n/g, ' ');
  const m = text.match(MAY_CONTAIN);
  const main = m ? text.slice(0, m.index) : text;
  // the shade list ends at its closing bracket; anything after it is not part of the list
  const tail = m ? text.slice(m.index! + m[0].length).split(']')[0] : '';
  const clean = (part: string) => splitTopLevel(part).map(normalizeName).filter((x) => x && !/^(AND|ET|VE|و)$/.test(x));
  return { items: clean(main), mayContain: clean(tail), raw };
}
