import { normalizeName } from './parse';

/**
 * Built-in equivalences between labelling conventions (EU INCI vs US vs bilingual labels). Each group maps to
 * one canonical key. These are naming conventions, not chemistry claims; the database table
 * ingredient_synonyms extends this list with sourced entries.
 */
const GROUPS: string[][] = [
  ['AQUA', 'WATER', 'EAU', 'AQUA (WATER)', 'WATER (AQUA)', 'AQUA/WATER', 'WATER/AQUA', 'AQUA/WATER/EAU', 'WATER/AQUA/EAU', 'WATER (AQUA/EAU)', 'AQUA (WATER/EAU)', 'SU'],
  ['PARFUM', 'FRAGRANCE', 'PARFUM (FRAGRANCE)', 'FRAGRANCE (PARFUM)', 'PARFUM/FRAGRANCE', 'FRAGRANCE/PARFUM'],
  ['CI 77891', 'TITANIUM DIOXIDE', 'TITANIUM DIOXIDE (CI 77891)', 'CI 77891 (TITANIUM DIOXIDE)'],
  ['CI 77491', 'IRON OXIDES (CI 77491)', 'CI 77491 (IRON OXIDES)'],
  ['CI 77492', 'IRON OXIDES (CI 77492)', 'CI 77492 (IRON OXIDES)'],
  ['CI 77499', 'IRON OXIDES (CI 77499)', 'CI 77499 (IRON OXIDES)'],
  ['CI 77007', 'ULTRAMARINES', 'ULTRAMARINES (CI 77007)'],
  ['CI 77742', 'MANGANESE VIOLET', 'MANGANESE VIOLET (CI 77742)'],
  ['CI 77288', 'CHROMIUM OXIDE GREENS', 'CHROMIUM OXIDE GREENS (CI 77288)'],
  ['CI 77289', 'CHROMIUM HYDROXIDE GREEN', 'CHROMIUM HYDROXIDE GREEN (CI 77289)'],
  ['CI 77510', 'FERRIC FERROCYANIDE', 'FERRIC FERROCYANIDE (CI 77510)'],
  ['CI 77163', 'BISMUTH OXYCHLORIDE', 'BISMUTH OXYCHLORIDE (CI 77163)'],
  ['CI 77019', 'MICA', 'MICA (CI 77019)'],
  ['CI 19140', 'YELLOW 5', 'YELLOW 5 LAKE', 'FD&C YELLOW NO. 5', 'TARTRAZINE'],
  ['CI 15985', 'YELLOW 6', 'YELLOW 6 LAKE', 'FD&C YELLOW NO. 6'],
  ['CI 42090', 'BLUE 1', 'BLUE 1 LAKE', 'FD&C BLUE NO. 1'],
  ['CI 15850', 'RED 6', 'RED 7', 'RED 6 LAKE', 'RED 7 LAKE'],
  ['CI 45410', 'RED 27', 'RED 28', 'RED 27 LAKE'],
  ['CI 17200', 'RED 33', 'RED 33 LAKE'],
  ['CI 16035', 'RED 40', 'RED 40 LAKE'],
  ['CI 75470', 'CARMINE'],
  ['TOCOPHERYL ACETATE', 'VITAMIN E ACETATE'],
  ['SODIUM HYALURONATE', 'HYALURONATE SODIUM'],
];

const KEY = new Map<string, string>();
for (const g of GROUPS) for (const n of g) KEY.set(normalizeName(n), normalizeName(g[0]));

/** Canonical comparison key. Extra synonyms (from the database) can be passed in. */
export function canonical(name: string, extra?: ReadonlyMap<string, string>): string {
  const n = normalizeName(name);
  return extra?.get(n) ?? KEY.get(n) ?? n;
}
