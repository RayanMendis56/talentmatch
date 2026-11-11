// Plain-regex CV parser. No LLM. Leaves a field null/empty when it cannot find it.

export interface Role {
  title: string;
  company: string | null;
  start: string; // YYYY-MM
  end: string; // YYYY-MM (Present resolved to today)
  isCurrent: boolean;
}

export interface ParsedCv {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  currentDesignation: string | null;
  currentCompany: string | null;
  totalExperienceYears: number | null;
  skills: string[];
  workHistory: Role[];
  rawText: string;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// "January 2021 – Present", "June 2018 - December 2020", also "2014 - 2017"
const MON = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?";
const POINT = `(?:${MON}\\s+\\d{4}|\\d{4})`;
const RANGE_RE = new RegExp(
  `(${POINT})\\s*(?:-|–|—|to)\\s*(${POINT}|Present|Current|Now|Today)`,
  "i"
);

function toYM(s: string, today: Date, isEnd: boolean): { y: number; m: number } {
  if (/present|current|now|today/i.test(s)) return { y: today.getFullYear(), m: today.getMonth() + 1 };
  const mon = s.match(/[A-Za-z]+/);
  const year = parseInt(s.match(/\d{4}/)![0], 10);
  if (mon) return { y: year, m: MONTHS[mon[0].slice(0, 3).toLowerCase()] ?? 1 };
  return { y: year, m: isEnd ? 12 : 1 }; // year only: span the whole year
}

const ym = (p: { y: number; m: number }) => p.y * 12 + (p.m - 1);
const fmt = (n: number) => `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;

// ---------- sections ----------
const HEADING_RE =
  /^(PROFESSIONAL SUMMARY|SUMMARY|OBJECTIVE|CAREER OBJECTIVE|ABOUT ME|SENIOR EXECUTIVE PROFILE|PROFESSIONAL EXPERIENCE|WORK EXPERIENCE|WORK HISTORY|EXPERIENCE|EMPLOYMENT HISTORY|EDUCATION|ACADEMIC BACKGROUND|SKILLS|TECHNICAL SKILLS|PROFESSIONAL SKILLS|ADDITIONAL SKILLS|CORE COMPETENCIES|TECHNICAL PROFICIENCIES|KEY SKILLS|CERTIFICATIONS?|CERTIFICATES|CERTIFICATIONS? (?:&|AND) [A-Z ]+|PROFESSIONAL CERTIFICATIONS|PROFESSIONAL AFFILIATIONS|PROFESSIONAL DEVELOPMENT|PROFESSIONAL ACTIVITIES|LANGUAGES|HOBBIES|INTERESTS|ADDITIONAL INFORMATION|OTHER INFORMATION|OTHER|ACHIEVEMENTS|PROFESSIONAL ACHIEVEMENTS|SELECTED ACHIEVEMENTS|ACCOMPLISHMENTS|AWARDS(?: AND ACHIEVEMENTS)?|HONORS|PROJECTS|PUBLICATIONS(?: & PATENTS)?|REFERENCES|BAR ADMISSIONS)$/i;

function splitSections(lines: string[]): { name: string; lines: string[] }[] {
  const out: { name: string; lines: string[] }[] = [{ name: "HEADER", lines: [] }];
  for (const raw of lines) {
    const t = raw.replace(/[*#]/g, "").replace(/:$/, "").trim();
    if (t && t.length < 45 && HEADING_RE.test(t) && !/^[-•]/.test(t)) {
      out.push({ name: t.toUpperCase(), lines: [] });
    } else out[out.length - 1].lines.push(raw);
  }
  return out;
}

const isExperience = (n: string) =>
  /EXPERIENCE|WORK HISTORY|EMPLOYMENT/.test(n);
const isSkills = (n: string) =>
  /SKILLS|COMPETENCIES|PROFICIENCIES/.test(n);

// ---------- roles ----------
function parseRoles(lines: string[], today: Date): Role[] {
  const roles: Role[] = [];
  const clean = lines.map((l) => l.replace(/\s+$/, ""));
  for (let i = 0; i < clean.length; i++) {
    const line = clean[i].trim();
    if (!line || /^[-•*]/.test(line)) continue;
    const m = line.match(RANGE_RE);
    if (!m) continue;
    // Layout C: "Title      <wide gap>      June 2022 – Present" with "Company, City" on the line above
    const wide = line.match(/^(.+?)\s{4,}(?:\S.*)?$/);
    const beforeRange = line.slice(0, line.indexOf(m[0])).trim();
    if (beforeRange && /\s{4,}$/.test(line.slice(0, line.indexOf(m[0]))) && wide) {
      let j = i - 1;
      while (j >= 0 && !clean[j].trim()) j--;
      const comp = j >= 0 ? clean[j].trim() : "";
      if (comp && !/^[-•*]/.test(comp)) {
        const s2 = toYM(m[1], today, false), e2 = toYM(m[2], today, true);
        if (ym(e2) >= ym(s2))
          roles.push({
            title: beforeRange,
            company: comp.replace(/,\s*[^,]+$/, "").trim() || comp,
            start: fmt(ym(s2)), end: fmt(ym(e2)),
            isCurrent: /present|current|now|today/i.test(m[2]),
          });
        continue;
      }
    }
    // a date line is short and mostly just the range
    if (line.length > m[0].length + 100) continue;

    // look upward for the nearest two non-empty, non-bullet lines: company, title
    const above: string[] = [];
    for (let j = i - 1; j >= 0 && above.length < 2; j--) {
      const t = clean[j].trim();
      if (!t) { if (above.length) break; else continue; }
      if (/^[-•*]/.test(t) || t.length > 120) break;
      above.push(t);
    }
    let title: string | null = null;
    let company: string | null = null;
    // Layout A: Title / Company - City / dates      Layout B: Title | Company on one line
    if (above.length >= 2) { company = above[0]; title = above[1]; }
    else if (above.length === 1) { title = above[0]; }
    // dates may sit on the company line: "Company - City | Jan 2020 – Present"
    const inline = line.replace(RANGE_RE, "").replace(/[|,–-]\s*$/, "").trim();
    if (inline && /\|/.test(inline)) company = inline.split("|")[0].trim(); // "Company | City | dates"
    else if (inline && !company) company = inline;
    if (!title) continue;
    // tidy: drop trailing ", City, Country" / " - City, Country" from company
    if (company) company = company.replace(/\s+[-–|]\s+[^-–|]+$/, "").replace(/,\s*[^,]+(?:,\s*[^,]+)?$/, "").trim() || company;

    const s = toYM(m[1], today, false);
    const e = toYM(m[2], today, true);
    if (ym(e) < ym(s)) continue;
    roles.push({
      title: title.replace(/\s+[-–|].*$/, "").trim(),
      company: company || null,
      start: fmt(ym(s)),
      end: fmt(ym(e)),
      isCurrent: /present|current|now|today/i.test(m[2]),
    });
  }
  return roles;
}

// merge overlapping intervals so overlapping roles count once
export function totalMonths(roles: Role[]): number {
  const iv = roles
    .map((r) => {
      const [sy, sm] = r.start.split("-").map(Number);
      const [ey, em] = r.end.split("-").map(Number);
      return [sy * 12 + sm - 1, ey * 12 + em - 1 + 1] as [number, number]; // end month inclusive
    })
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const [s, e] of iv) {
    if (!cur) cur = [s, e];
    else if (s <= cur[1]) cur[1] = Math.max(cur[1], e);
    else { total += cur[1] - cur[0]; cur = [s, e]; }
  }
  if (cur) total += cur[1] - cur[0];
  return total;
}

// ---------- skills ----------
function parseSkills(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    let t = raw.replace(/^[\s\-•*·▪●]+/, "").replace(/\*\*/g, "").trim();
    if (!t || /^-{3,}$/.test(t)) continue;
    // "Category: a, b, c" -> keep only the list after the colon
    const colon = t.indexOf(":");
    if (colon > -1 && colon < 50) t = t.slice(colon + 1);
    for (const part of t.split(/[,;|•·]/)) {
      const s = part.trim().replace(/\.$/, "");
      if (s.length >= 2 && s.length <= 80) out.push(s);
    }
  }
  return [...new Set(out)];
}

// ---------- main ----------
export function parseCv(id: string, raw: string, today = new Date()): ParsedCv {
  const rawText = raw.replace(/\r\n/g, "\n");
  const lines = rawText.split("\n");
  const firstLine = lines.find((l) => l.trim())?.replace(/[*#]/g, "").trim() ?? null;

  const email = rawText.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0] ?? null;
  const headerBlock = lines.slice(0, 12).join("\n");
  const phone =
    headerBlock.match(/\+?\(?\d[\d\s().-]{7,}\d/)?.[0]?.trim() ?? null;

  const sections = splitSections(lines);
  const expLines = sections.filter((s) => isExperience(s.name)).flatMap((s) => s.lines);
  const roles = parseRoles(expLines, today);

  // current = role with latest end, ties broken by latest start
  const sorted = [...roles].sort((a, b) => (b.end + b.start).localeCompare(a.end + a.start));
  const current = sorted[0];

  const skillLines = sections.filter((s) => isSkills(s.name)).flatMap((s) => s.lines);
  const skills = parseSkills(skillLines);

  return {
    id,
    name: firstLine,
    email,
    phone,
    currentDesignation: current?.title ?? null,
    currentCompany: current?.company ?? null,
    totalExperienceYears: roles.length ? Math.round((totalMonths(roles) / 12) * 10) / 10 : null,
    skills,
    workHistory: roles,
    rawText,
  };
}