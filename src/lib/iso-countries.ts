/**
 * Stage 6E+1 — complete ISO 3166-1 country/territory dataset powered by
 * `i18n-iso-countries` (worldwide, 250+ entries) and `libphonenumber-js`
 * (ITU-T E.164 country calling codes + phone validation).
 *
 * Replaces the Stage 6E hand-maintained 50-row list, which was both
 * incomplete and unmaintained. These two libraries are the de facto
 * standards; we lean on them so the dataset tracks ISO additions
 * (e.g. "Türkiye" → "Turkey") without manual churn.
 *
 * Nationality — libphonenumber-js has no demonym data. We generate a
 * best-effort English demonym from the country name for the common
 * cases, and fall back to the country name as the demonym where we
 * don't have a mapping. Operators can always type a free value into
 * the datalist so "nationality independent of residence" works even
 * for stateless or edge-case entries.
 */

import countries from 'i18n-iso-countries';
import en from 'i18n-iso-countries/langs/en.json' with { type: 'json' };
import { getCountries, getCountryCallingCode, isValidPhoneNumber } from 'libphonenumber-js';

countries.registerLocale(en);

export type IsoCountry = {
  /** ISO 3166-1 alpha-2 code, e.g. "ZA". */
  code: string;
  /** Common English name used in UI. */
  name: string;
  /** Common English demonym (adjective) for nationality selector,
   *  e.g. "South African". Falls back to the country name when no
   *  mapping is known. */
  nationality: string;
  /** E.164 country calling code without the leading `+`, e.g. "27".
   *  Null when the territory has no assignment (rare). */
  callingCode: string | null;
};

// Best-effort English demonyms for the countries we care most about.
// Keyed by ISO2 code so the lookup is cheap and additions are obvious.
// Unmapped countries fall back to the country name (used in the
// nationality datalist — operators can type any value).
const DEMONYM: Record<string, string> = {
  AE: 'Emirati',
  AF: 'Afghan',
  AG: 'Antiguan',
  AL: 'Albanian',
  AM: 'Armenian',
  AO: 'Angolan',
  AR: 'Argentine',
  AT: 'Austrian',
  AU: 'Australian',
  AZ: 'Azerbaijani',
  BA: 'Bosnian',
  BB: 'Barbadian',
  BD: 'Bangladeshi',
  BE: 'Belgian',
  BF: 'Burkinabé',
  BG: 'Bulgarian',
  BH: 'Bahraini',
  BI: 'Burundian',
  BJ: 'Beninese',
  BN: 'Bruneian',
  BO: 'Bolivian',
  BR: 'Brazilian',
  BS: 'Bahamian',
  BT: 'Bhutanese',
  BW: 'Botswanan',
  BY: 'Belarusian',
  BZ: 'Belizean',
  CA: 'Canadian',
  CD: 'Congolese',
  CF: 'Central African',
  CG: 'Congolese',
  CH: 'Swiss',
  CI: 'Ivorian',
  CL: 'Chilean',
  CM: 'Cameroonian',
  CN: 'Chinese',
  CO: 'Colombian',
  CR: 'Costa Rican',
  CU: 'Cuban',
  CV: 'Cape Verdean',
  CY: 'Cypriot',
  CZ: 'Czech',
  DE: 'German',
  DJ: 'Djiboutian',
  DK: 'Danish',
  DM: 'Dominican',
  DO: 'Dominican',
  DZ: 'Algerian',
  EC: 'Ecuadorian',
  EE: 'Estonian',
  EG: 'Egyptian',
  ER: 'Eritrean',
  ES: 'Spanish',
  ET: 'Ethiopian',
  FI: 'Finnish',
  FJ: 'Fijian',
  FR: 'French',
  GA: 'Gabonese',
  GB: 'British',
  GD: 'Grenadian',
  GE: 'Georgian',
  GH: 'Ghanaian',
  GM: 'Gambian',
  GN: 'Guinean',
  GQ: 'Equatoguinean',
  GR: 'Greek',
  GT: 'Guatemalan',
  GW: 'Bissau-Guinean',
  GY: 'Guyanese',
  HN: 'Honduran',
  HR: 'Croatian',
  HT: 'Haitian',
  HU: 'Hungarian',
  ID: 'Indonesian',
  IE: 'Irish',
  IL: 'Israeli',
  IN: 'Indian',
  IQ: 'Iraqi',
  IR: 'Iranian',
  IS: 'Icelandic',
  IT: 'Italian',
  JM: 'Jamaican',
  JO: 'Jordanian',
  JP: 'Japanese',
  KE: 'Kenyan',
  KG: 'Kyrgyz',
  KH: 'Cambodian',
  KI: 'I-Kiribati',
  KM: 'Comoran',
  KN: 'Kittitian',
  KP: 'North Korean',
  KR: 'South Korean',
  KW: 'Kuwaiti',
  KZ: 'Kazakhstani',
  LA: 'Lao',
  LB: 'Lebanese',
  LC: 'Saint Lucian',
  LI: 'Liechtensteiner',
  LK: 'Sri Lankan',
  LR: 'Liberian',
  LS: 'Mosotho',
  LT: 'Lithuanian',
  LU: 'Luxembourger',
  LV: 'Latvian',
  LY: 'Libyan',
  MA: 'Moroccan',
  MC: 'Monégasque',
  MD: 'Moldovan',
  ME: 'Montenegrin',
  MG: 'Malagasy',
  MH: 'Marshallese',
  MK: 'Macedonian',
  ML: 'Malian',
  MM: 'Burmese',
  MN: 'Mongolian',
  MR: 'Mauritanian',
  MT: 'Maltese',
  MU: 'Mauritian',
  MV: 'Maldivian',
  MW: 'Malawian',
  MX: 'Mexican',
  MY: 'Malaysian',
  MZ: 'Mozambican',
  NA: 'Namibian',
  NE: 'Nigerien',
  NG: 'Nigerian',
  NI: 'Nicaraguan',
  NL: 'Dutch',
  NO: 'Norwegian',
  NP: 'Nepali',
  NR: 'Nauruan',
  NZ: 'New Zealander',
  OM: 'Omani',
  PA: 'Panamanian',
  PE: 'Peruvian',
  PG: 'Papua New Guinean',
  PH: 'Filipino',
  PK: 'Pakistani',
  PL: 'Polish',
  PT: 'Portuguese',
  PW: 'Palauan',
  PY: 'Paraguayan',
  QA: 'Qatari',
  RO: 'Romanian',
  RS: 'Serbian',
  RU: 'Russian',
  RW: 'Rwandan',
  SA: 'Saudi Arabian',
  SB: 'Solomon Islander',
  SC: 'Seychellois',
  SD: 'Sudanese',
  SE: 'Swedish',
  SG: 'Singaporean',
  SI: 'Slovenian',
  SK: 'Slovak',
  SL: 'Sierra Leonean',
  SM: 'Sammarinese',
  SN: 'Senegalese',
  SO: 'Somali',
  SR: 'Surinamese',
  SS: 'South Sudanese',
  ST: 'São Toméan',
  SV: 'Salvadoran',
  SY: 'Syrian',
  SZ: 'Swazi',
  TD: 'Chadian',
  TG: 'Togolese',
  TH: 'Thai',
  TJ: 'Tajikistani',
  TL: 'Timorese',
  TM: 'Turkmen',
  TN: 'Tunisian',
  TO: 'Tongan',
  TR: 'Turkish',
  TT: 'Trinidadian',
  TV: 'Tuvaluan',
  TW: 'Taiwanese',
  TZ: 'Tanzanian',
  UA: 'Ukrainian',
  UG: 'Ugandan',
  US: 'American',
  UY: 'Uruguayan',
  UZ: 'Uzbek',
  VA: 'Vatican',
  VC: 'Vincentian',
  VE: 'Venezuelan',
  VN: 'Vietnamese',
  VU: 'Ni-Vanuatu',
  WS: 'Samoan',
  YE: 'Yemeni',
  ZA: 'South African',
  ZM: 'Zambian',
  ZW: 'Zimbabwean',
};

/**
 * Build the full worldwide ISO country list once at module load. The
 * i18n-iso-countries package ships every ISO 3166-1 alpha-2 code
 * (250+ including territories). We join it with the libphonenumber-js
 * calling-code set so missing-calling-code territories (Antarctica,
 * EU, etc.) still appear in the residence picker, just without a
 * phone prefix.
 */
export const ISO_COUNTRIES: readonly IsoCountry[] = (() => {
  const callingCodeSet = new Set(getCountries());
  const allNames = countries.getNames('en', { select: 'official' });
  const list: IsoCountry[] = [];
  for (const [code, name] of Object.entries(allNames)) {
    let callingCode: string | null = null;
    if (callingCodeSet.has(code as typeof getCountries extends () => (infer T)[] ? T : never)) {
      try {
        callingCode = getCountryCallingCode(
          code as typeof getCountries extends () => (infer T)[] ? T : never,
        );
      } catch {
        callingCode = null;
      }
    }
    list.push({
      code,
      name,
      nationality: DEMONYM[code] ?? name,
      callingCode,
    });
  }
  return list;
})();

export const COUNTRIES_SORTED = [...ISO_COUNTRIES].sort((a, b) => a.name.localeCompare(b.name));

export function findCountryByName(name: string): IsoCountry | undefined {
  if (!name) return undefined;
  const n = name.toLowerCase();
  return ISO_COUNTRIES.find((c) => c.name.toLowerCase() === n);
}

export function findCountryByCode(code: string): IsoCountry | undefined {
  return ISO_COUNTRIES.find((c) => c.code === code.toUpperCase());
}

export function findCountryByNationality(nationality: string): IsoCountry | undefined {
  if (!nationality) return undefined;
  const n = nationality.toLowerCase();
  return ISO_COUNTRIES.find((c) => c.nationality?.toLowerCase() === n);
}

/**
 * Flag emoji from an ISO alpha-2 code — maps to a Regional Indicator
 * Symbol pair (U+1F1E6..U+1F1FF). Returns '' for unknown codes so
 * callers can simply omit the flag.
 */
export function flagEmojiFromCode(code: string | null | undefined): string {
  if (code?.length !== 2) return '';
  const A = 0x1f1e6;
  const codePoints = code
    .toUpperCase()
    .split('')
    .map((ch) => A + (ch.charCodeAt(0) - 'A'.charCodeAt(0)));
  return String.fromCodePoint(...codePoints);
}

/** Flag emoji from a country NAME ("South Africa"); '' when unknown. */
export function flagEmojiFromCountryName(name: string | null | undefined): string {
  if (!name) return '';
  return flagEmojiFromCode(findCountryByName(name)?.code);
}

/** Flag emoji from a NATIONALITY demonym ("South African"); '' when unknown. */
export function flagEmojiFromNationality(nationality: string | null | undefined): string {
  if (!nationality) return '';
  return flagEmojiFromCode(findCountryByNationality(nationality)?.code);
}

/**
 * Irish immigration status enum. Captured on CS leads so the Client
 * Workspace can distinguish current permission from a case/application
 * type (Stage 5 established this invariant for the Candidate Card).
 * "Not currently in Ireland" is the sensible default for a residence-
 * outside-Ireland lead; the workspace renders it as a neutral badge.
 */
export const IRISH_IMMIGRATION_STATUSES = [
  { value: 'NONE', label: 'Not currently in Ireland / no Irish immigration permission' },
  { value: 'STAMP_1', label: 'Stamp 1' },
  { value: 'STAMP_1G', label: 'Stamp 1G' },
  { value: 'STAMP_2', label: 'Stamp 2' },
  { value: 'STAMP_3', label: 'Stamp 3' },
  { value: 'STAMP_4', label: 'Stamp 4' },
  { value: 'OTHER', label: 'Other Irish permission' },
  { value: 'PENDING', label: 'Permission pending' },
  { value: 'NOT_PROVIDED', label: 'Not provided' },
] as const;

export type IrishImmigrationStatus = (typeof IRISH_IMMIGRATION_STATUSES)[number]['value'];

/**
 * Stage 6E+1 — delegate E.164 validation to libphonenumber-js (country-
 * aware). This matches the ITU-T E.164 spec more faithfully than a
 * hand-rolled regex: it accepts valid real-world numbers (including
 * special country-code lengths) and rejects impossible ones.
 *
 * The simple regex `/^\+[1-9]\d{6,14}$/` is kept as a fallback for
 * environments where the full library isn't available (e.g., Zod
 * schemas in `use server` graphs); the UI uses the richer validator.
 */
export function isValidE164(phone: string): boolean {
  return isValidPhoneNumber(phone);
}

export const E164_REGEX = /^\+[1-9]\d{6,14}$/;
