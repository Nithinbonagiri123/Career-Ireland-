/**
 * Pure text-processing routines for CV parsing — no DB, no S3, no env.
 *
 * Split out from `suggest.ts` so the extraction heuristics can be
 * unit-tested against fixture strings without loading environment
 * variables or hitting the database.
 */

export type CatalogHit = { id: string; name: string; foundIn: string };
export type CustomCandidate = { phrase: string; foundIn: string };
export type EmploymentCandidate = {
  /** Stable per-scan React key. */
  key: string;
  employerName: string;
  jobTitle: string | null;
  location: string | null;
  /** ISO `YYYY-MM-DD` or `YYYY-MM-01` when only month/year were found. */
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  description: string | null;
  foundIn: string;
};

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find catalog names that appear in the text as whole-word matches.
 * Case-insensitive. Returns entries paired with the surrounding sentence
 * as `foundIn` so the panel can show the operator where it came from.
 */
export function catalogHitsFor(
  text: string,
  catalog: Array<{ id: string; name: string }>,
  excludeIds: Set<string>,
): CatalogHit[] {
  const hits: CatalogHit[] = [];
  for (const c of catalog) {
    if (excludeIds.has(c.id)) continue;
    const term = c.name.toLowerCase();
    if (term.length < 2) continue;
    const re = new RegExp(`\\b${esc(term)}\\b`, 'i');
    const match = re.exec(text);
    if (!match) continue;
    const idx = match.index;
    const start = Math.max(0, idx - 40);
    const end = Math.min(text.length, idx + term.length + 40);
    const foundIn = text.slice(start, end).replace(/\s+/g, ' ').trim();
    hits.push({ id: c.id, name: c.name, foundIn });
  }
  return hits;
}

/**
 * True when the line "looks like" a section header — short (< 60 chars),
 * mostly uppercase or Title Case, no sentence punctuation. Used to
 * recognise a header keyword line when we're looking for the *start* of
 * a section (permissive matcher).
 */
export function looksLikeHeader(line: string): boolean {
  if (line.length > 60) return false;
  if (/[.!?]$/.test(line)) return false;
  const letters = line.replace(/[^A-Za-z]/g, '');
  if (letters.length < 3) return false;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  return upper / letters.length > 0.6 || /^[A-Z][a-z]+(\s+[A-Z&][a-zA-Z]*)*$/.test(line);
}

/**
 * Known "top-level" section headers we can use as a hard boundary. A
 * line qualifies as `looksLikeStrongHeader` when either it is mostly
 * uppercase (a formatted-heading convention) *or* it whole-word matches
 * one of these keywords. This avoids treating a Title-Case job line
 * like "Senior Software Engineer — Stripe" as a section boundary.
 */
const STRONG_HEADER_KEYWORDS = new Set([
  'summary',
  'profile',
  'objective',
  'about',
  'contact',
  'skills',
  'competencies',
  'technologies',
  'tools',
  'proficiencies',
  'languages',
  'education',
  'educational',
  'academic',
  'qualifications',
  'qualification',
  'certifications',
  'certification',
  'training',
  'courses',
  'employment',
  'work',
  'experience',
  'career',
  'professional',
  'projects',
  'publications',
  'references',
  'referees',
  'hobbies',
  'interests',
  'volunteering',
  'awards',
  'achievements',
  'personal',
]);

export function looksLikeStrongHeader(line: string): boolean {
  if (!looksLikeHeader(line)) return false;
  const letters = line.replace(/[^A-Za-z]/g, '');
  if (letters.length < 3) return false;
  const upperRatio = letters.replace(/[^A-Z]/g, '').length / letters.length;
  if (upperRatio > 0.85 && line.length < 40) return true;
  // Otherwise require whole-word match against known section vocabulary.
  const tokens = line.toLowerCase().match(/[a-z]+/g) ?? [];
  return tokens.some((t) => STRONG_HEADER_KEYWORDS.has(t));
}

/**
 * Pull candidate free-text phrases from a section. Match is permissive:
 * the header only needs to *contain* one of the given keywords on a
 * short header-shaped line. The section ends at another header-shaped
 * line or a long blank run.
 */
export function customCandidatesFrom(
  text: string,
  sectionKeywords: string[],
  taken: Set<string>,
): CustomCandidate[] {
  const out: CustomCandidate[] = [];
  const lines = text.split(/\r?\n/);
  const keywordRe = new RegExp(`\\b(${sectionKeywords.map(esc).join('|')})\\b`, 'i');

  let inSection = false;
  let linesInSection = 0;
  let blankRun = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      blankRun += 1;
      if (blankRun >= 2) inSection = false;
      continue;
    }
    blankRun = 0;

    const isHeaderLine = looksLikeHeader(line);
    const containsKeyword = keywordRe.test(line);

    if (isHeaderLine && containsKeyword) {
      inSection = true;
      linesInSection = 0;
      continue;
    }
    // Only *strong* headers end the section — Title-Case job-title lines
    // shouldn't cut off a Skills / Education section prematurely.
    if (inSection && looksLikeStrongHeader(line) && !containsKeyword && linesInSection > 0) {
      inSection = false;
      continue;
    }
    if (inSection && linesInSection > 40) {
      inSection = false;
      continue;
    }
    if (!inSection) continue;
    linesInSection += 1;

    const parts = line
      .replace(/^[\s•\-*·▪◦]+/, '')
      .split(/[,;·|]| {2,}| - /)
      .map((p) => p.trim())
      .filter((p) => p.length >= 2 && p.length <= 80);

    for (const p of parts) {
      const key = p.toLowerCase();
      if (taken.has(key)) continue;
      taken.add(key);
      out.push({ phrase: p, foundIn: line.slice(0, 120) });
    }
  }
  return out;
}

// ─── Employment history extraction ──────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const PRESENT_WORDS = /\b(present|current|now|to\s*date|ongoing)\b/i;

type ParsedDate = { iso: string } | null;

function padYearMonth(year: number, month: number): string {
  const y = String(year).padStart(4, '0');
  const m = String(month).padStart(2, '0');
  return `${y}-${m}-01`;
}

function parseDatePart(raw: string): ParsedDate {
  const s = raw.trim();
  if (!s) return null;
  if (PRESENT_WORDS.test(s)) return null;
  const m1 = s.match(/^([A-Za-z]{3,9})\s*'?(\d{2}|\d{4})$/);
  if (m1) {
    const month = MONTHS[m1[1].toLowerCase()];
    if (month) {
      let year = parseInt(m1[2], 10);
      if (year < 100) year += year > 60 ? 1900 : 2000;
      return { iso: padYearMonth(year, month) };
    }
  }
  const m2 = s.match(/^(\d{1,2})[/-](\d{4})$/);
  if (m2) {
    const month = parseInt(m2[1], 10);
    const year = parseInt(m2[2], 10);
    if (month >= 1 && month <= 12) return { iso: padYearMonth(year, month) };
  }
  const m3 = s.match(/^(\d{4})$/);
  if (m3) {
    return { iso: `${m3[1]}-01-01` };
  }
  const m4 = s.match(/^(\d{1,2})[/\- ](\d{1,2}|[A-Za-z]{3,9})[/\- ](\d{2}|\d{4})$/);
  if (m4) {
    const monthRaw = m4[2];
    const month = /^\d+$/.test(monthRaw) ? parseInt(monthRaw, 10) : MONTHS[monthRaw.toLowerCase()];
    if (month) {
      let year = parseInt(m4[3], 10);
      if (year < 100) year += year > 60 ? 1900 : 2000;
      return { iso: padYearMonth(year, month) };
    }
  }
  return null;
}

type DateRange = {
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  matchedText: string;
};

function findDateRange(text: string): DateRange | null {
  const dateAlt =
    "(?:[A-Za-z]{3,9}\\s*\\d{4}|[A-Za-z]{3,9}\\s*'?\\d{2}|\\d{1,2}[\\/\\-]\\d{4}|\\d{4}|Present|Current|Now|Ongoing)";
  const sep = '\\s*(?:[-–—]|to)\\s*';
  const re = new RegExp(`(${dateAlt})${sep}(${dateAlt}|Present|Current|Now|Ongoing)`, 'i');
  const m = text.match(re);
  if (!m) return null;
  const start = parseDatePart(m[1]);
  const endRaw = m[2];
  const endIsPresent = PRESENT_WORDS.test(endRaw);
  const end = endIsPresent ? null : parseDatePart(endRaw);
  return {
    startDate: start?.iso ?? null,
    endDate: end?.iso ?? null,
    isCurrent: endIsPresent,
    matchedText: m[0],
  };
}

function splitEmploymentBlocks(sectionLines: string[]): string[][] {
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const raw of sectionLines) {
    const line = raw.trim();
    if (!line) {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) blocks.push(current);
  const refined: string[][] = [];
  for (const block of blocks) {
    if (block.length <= 8) {
      refined.push(block);
      continue;
    }
    let running: string[] = [];
    for (const line of block) {
      if (running.length > 0 && findDateRange(line)) {
        refined.push(running);
        running = [line];
      } else {
        running.push(line);
      }
    }
    if (running.length > 0) refined.push(running);
  }
  return refined;
}

function parseEmploymentBlock(block: string[]): EmploymentCandidate | null {
  if (block.length === 0) return null;
  const joined = block.join(' — ');
  const range = findDateRange(joined);

  const identityLines: string[] = [];
  const descLines: string[] = [];
  let seenBullet = false;
  for (const line of block) {
    const isBullet = /^[•\-*·▪◦]/.test(line);
    const isDateOnly =
      !!range &&
      line.replace(/\s+/g, '').toLowerCase() ===
        range.matchedText.replace(/\s+/g, '').toLowerCase();
    if (isDateOnly) continue;
    if (!seenBullet && !isBullet && identityLines.length < 3 && line.length <= 120) {
      identityLines.push(line);
    } else {
      seenBullet = seenBullet || isBullet;
      descLines.push(line.replace(/^[•\-*·▪◦]\s*/, '').trim());
    }
  }

  if (identityLines.length === 0) return null;

  let employerName: string | null = null;
  let jobTitle: string | null = null;
  let location: string | null = null;

  const first = identityLines[0];
  const second = identityLines[1] ?? '';

  const atMatch = first.match(/^(.+?)\s+(?:at|@|-|–|—|,)\s+(.+)$/i);
  if (atMatch) {
    const [, a, b] = atMatch;
    if (
      /\b(engineer|developer|manager|analyst|consultant|nurse|doctor|assistant|lead|director|officer|specialist|technician|designer|architect|administrator|coordinator|executive|supervisor|associate)\b/i.test(
        a,
      )
    ) {
      jobTitle = a.trim();
      employerName = b.trim();
    } else {
      employerName = a.trim();
      jobTitle = b.trim();
    }
  } else {
    employerName = first;
    jobTitle = second || null;
  }

  const maybeLocation = identityLines[2] ?? '';
  if (maybeLocation && maybeLocation.length <= 80 && !/\d/.test(maybeLocation)) {
    location = maybeLocation;
  }

  const stripRange = (s: string | null) => {
    if (!s || !range) return s;
    return (
      s
        .replace(range.matchedText, '')
        .replace(/[·|,\-–—]\s*$/, '')
        .trim() || null
    );
  };
  employerName = stripRange(employerName);
  jobTitle = stripRange(jobTitle);
  location = stripRange(location);

  if (!employerName || employerName.length < 2 || employerName.length > 200) return null;

  const description = descLines.length > 0 ? descLines.join('\n').slice(0, 1900) : null;

  const foundIn = block.slice(0, 4).join(' · ').slice(0, 180);
  const key = `${employerName.toLowerCase()}|${(jobTitle ?? '').toLowerCase()}|${range?.startDate ?? ''}`;

  return {
    key,
    employerName: employerName.slice(0, 200),
    jobTitle: jobTitle ? jobTitle.slice(0, 200) : null,
    location: location ? location.slice(0, 200) : null,
    startDate: range?.startDate ?? null,
    endDate: range?.endDate ?? null,
    isCurrent: range?.isCurrent ?? false,
    description,
    foundIn,
  };
}

export function extractEmploymentCandidates(
  text: string,
  taken: Set<string>,
): EmploymentCandidate[] {
  const lines = text.split(/\r?\n/);
  const keywordRe =
    /\b(employment(?:\s+history)?|work\s+(?:experience|history)|professional\s+(?:experience|history)|career\s+(?:history|summary)|experience)\b/i;

  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (looksLikeHeader(line) && keywordRe.test(line)) {
      startIdx = i + 1;
      break;
    }
  }
  if (startIdx === -1) return [];

  let endIdx = lines.length;
  let linesSeen = 0;
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    linesSeen += 1;
    // Only *strong* headers end the section; job title lines like
    // "Senior Software Engineer — Stripe" are title-case and would
    // otherwise be mistaken for a new section.
    if (linesSeen > 1 && looksLikeStrongHeader(line) && !keywordRe.test(line)) {
      endIdx = i;
      break;
    }
  }

  const sectionLines = lines.slice(startIdx, endIdx);
  const blocks = splitEmploymentBlocks(sectionLines);

  const out: EmploymentCandidate[] = [];
  for (const block of blocks) {
    const cand = parseEmploymentBlock(block);
    if (!cand) continue;
    if (!cand.startDate && !cand.endDate && !cand.isCurrent && !cand.description) continue;
    const dedupeKey = `${cand.employerName.toLowerCase()}|${(cand.jobTitle ?? '').toLowerCase()}`;
    if (taken.has(dedupeKey)) continue;
    taken.add(dedupeKey);
    out.push(cand);
  }
  return out;
}
