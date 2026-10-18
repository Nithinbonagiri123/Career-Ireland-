/**
 * Stage 6E Section 4 — ISO 3166-1 country dataset with calling codes.
 *
 * The list is intentionally static. We don't need a `locale`-aware
 * display: operator UI is English, every entry carries its common name,
 * ISO2 code and E.164 calling code. If a code is missing (edge cases
 * like Antarctica) we fall back to the country name only — the form
 * still accepts it but prefills no calling code.
 *
 * Source: based on the ISO 3166-1 alpha-2 standard + ITU-T E.164
 * country-code assignments. Verified for the territories the business
 * cares about (South Africa, Ireland, UK, India, EU + Gulf + sub-Saharan
 * Africa). Add new rows as needed — no code change elsewhere.
 */

export type IsoCountry = {
  /** ISO 3166-1 alpha-2 code, e.g. "ZA". */
  code: string;
  /** Common English name used in UI. */
  name: string;
  /** Common English demonym (adjective) for nationality selector,
   *  e.g. "South African". When a demonym is ambiguous or unused
   *  commercially we keep it empty and the UI falls back to the
   *  country name. */
  nationality: string;
  /** E.164 country calling code without the leading `+`, e.g. "27". */
  callingCode: string;
};

/** Not every entry — focused on the territories our clients actually
 *  reside in. Add rows at the bottom; order doesn't matter (the UI
 *  sorts by name). */
export const ISO_COUNTRIES: readonly IsoCountry[] = [
  { code: 'IE', name: 'Ireland', nationality: 'Irish', callingCode: '353' },
  { code: 'ZA', name: 'South Africa', nationality: 'South African', callingCode: '27' },
  { code: 'GB', name: 'United Kingdom', nationality: 'British', callingCode: '44' },
  { code: 'US', name: 'United States', nationality: 'American', callingCode: '1' },
  { code: 'CA', name: 'Canada', nationality: 'Canadian', callingCode: '1' },
  { code: 'IN', name: 'India', nationality: 'Indian', callingCode: '91' },
  { code: 'PK', name: 'Pakistan', nationality: 'Pakistani', callingCode: '92' },
  { code: 'BD', name: 'Bangladesh', nationality: 'Bangladeshi', callingCode: '880' },
  { code: 'LK', name: 'Sri Lanka', nationality: 'Sri Lankan', callingCode: '94' },
  { code: 'PH', name: 'Philippines', nationality: 'Filipino', callingCode: '63' },
  { code: 'NG', name: 'Nigeria', nationality: 'Nigerian', callingCode: '234' },
  { code: 'KE', name: 'Kenya', nationality: 'Kenyan', callingCode: '254' },
  { code: 'GH', name: 'Ghana', nationality: 'Ghanaian', callingCode: '233' },
  { code: 'ZW', name: 'Zimbabwe', nationality: 'Zimbabwean', callingCode: '263' },
  { code: 'BW', name: 'Botswana', nationality: 'Botswanan', callingCode: '267' },
  { code: 'NA', name: 'Namibia', nationality: 'Namibian', callingCode: '264' },
  { code: 'MW', name: 'Malawi', nationality: 'Malawian', callingCode: '265' },
  { code: 'ZM', name: 'Zambia', nationality: 'Zambian', callingCode: '260' },
  { code: 'MZ', name: 'Mozambique', nationality: 'Mozambican', callingCode: '258' },
  { code: 'AE', name: 'United Arab Emirates', nationality: 'Emirati', callingCode: '971' },
  { code: 'SA', name: 'Saudi Arabia', nationality: 'Saudi Arabian', callingCode: '966' },
  { code: 'QA', name: 'Qatar', nationality: 'Qatari', callingCode: '974' },
  { code: 'KW', name: 'Kuwait', nationality: 'Kuwaiti', callingCode: '965' },
  { code: 'BH', name: 'Bahrain', nationality: 'Bahraini', callingCode: '973' },
  { code: 'OM', name: 'Oman', nationality: 'Omani', callingCode: '968' },
  { code: 'EG', name: 'Egypt', nationality: 'Egyptian', callingCode: '20' },
  { code: 'FR', name: 'France', nationality: 'French', callingCode: '33' },
  { code: 'DE', name: 'Germany', nationality: 'German', callingCode: '49' },
  { code: 'ES', name: 'Spain', nationality: 'Spanish', callingCode: '34' },
  { code: 'IT', name: 'Italy', nationality: 'Italian', callingCode: '39' },
  { code: 'PT', name: 'Portugal', nationality: 'Portuguese', callingCode: '351' },
  { code: 'NL', name: 'Netherlands', nationality: 'Dutch', callingCode: '31' },
  { code: 'BE', name: 'Belgium', nationality: 'Belgian', callingCode: '32' },
  { code: 'PL', name: 'Poland', nationality: 'Polish', callingCode: '48' },
  { code: 'LT', name: 'Lithuania', nationality: 'Lithuanian', callingCode: '370' },
  { code: 'LV', name: 'Latvia', nationality: 'Latvian', callingCode: '371' },
  { code: 'EE', name: 'Estonia', nationality: 'Estonian', callingCode: '372' },
  { code: 'RO', name: 'Romania', nationality: 'Romanian', callingCode: '40' },
  { code: 'BG', name: 'Bulgaria', nationality: 'Bulgarian', callingCode: '359' },
  { code: 'HU', name: 'Hungary', nationality: 'Hungarian', callingCode: '36' },
  { code: 'CZ', name: 'Czech Republic', nationality: 'Czech', callingCode: '420' },
  { code: 'SK', name: 'Slovakia', nationality: 'Slovak', callingCode: '421' },
  { code: 'AU', name: 'Australia', nationality: 'Australian', callingCode: '61' },
  { code: 'NZ', name: 'New Zealand', nationality: 'New Zealander', callingCode: '64' },
  { code: 'MY', name: 'Malaysia', nationality: 'Malaysian', callingCode: '60' },
  { code: 'SG', name: 'Singapore', nationality: 'Singaporean', callingCode: '65' },
  { code: 'TH', name: 'Thailand', nationality: 'Thai', callingCode: '66' },
  { code: 'VN', name: 'Vietnam', nationality: 'Vietnamese', callingCode: '84' },
  { code: 'ID', name: 'Indonesia', nationality: 'Indonesian', callingCode: '62' },
  { code: 'CN', name: 'China', nationality: 'Chinese', callingCode: '86' },
  { code: 'JP', name: 'Japan', nationality: 'Japanese', callingCode: '81' },
  { code: 'KR', name: 'South Korea', nationality: 'South Korean', callingCode: '82' },
  { code: 'BR', name: 'Brazil', nationality: 'Brazilian', callingCode: '55' },
  { code: 'AR', name: 'Argentina', nationality: 'Argentine', callingCode: '54' },
  { code: 'MX', name: 'Mexico', nationality: 'Mexican', callingCode: '52' },
  { code: 'TR', name: 'Turkey', nationality: 'Turkish', callingCode: '90' },
] as const;

export const COUNTRIES_SORTED = [...ISO_COUNTRIES].sort((a, b) => a.name.localeCompare(b.name));

export function findCountryByName(name: string): IsoCountry | undefined {
  return ISO_COUNTRIES.find((c) => c.name.toLowerCase() === name.toLowerCase());
}

export function findCountryByCode(code: string): IsoCountry | undefined {
  return ISO_COUNTRIES.find((c) => c.code === code.toUpperCase());
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
 * E.164 phone number — a leading `+`, then 7 to 15 digits where the
 * first digit after `+` is 1-9 (no leading zero in the national part
 * of the international format). Matches ITU-T E.164.
 */
export const E164_REGEX = /^\+[1-9]\d{6,14}$/;
