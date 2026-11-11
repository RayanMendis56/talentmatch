// The LLM only makes JUDGMENTS (which skills match, how close the title is).
// All NUMBERS are computed here, so the 50/30/20 rules are always followed exactly.

export type Tier = "same" | "related" | "unrelated";

export const WEIGHTS = { skills: 50, experience: 30, designation: 20 } as const;
export const DESIGNATION_POINTS: Record<Tier, number> = { same: 20, related: 10, unrelated: 0 };

export interface Judgment {
  candidate_id: string;
  matched_skills: string[];
  designation_tier: Tier;
  note?: string;
}

export interface ScoreInput {
  jobTitle: string;
  requiredSkills: string[];
  expectedYears: number;
  candidate: { designation: string | null; years: number | null };
  judgment: Judgment;
}

export interface ScoreResult {
  total: number;
  skills: number;
  experience: number;
  designation: number;
  matched: string[];
  missing: string[];
  reason: string;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function normalizeTier(t: unknown): Tier {
  const s = String(t ?? "").toLowerCase();
  return s === "same" || s === "related" ? s : "unrelated";
}

export function computeScore(i: ScoreInput): ScoreResult {
  // keep only skills that really are in the job's list (guards against the model inventing names)
  const byLower = new Map(i.requiredSkills.map((s) => [s.toLowerCase().trim(), s]));
  const matchedSet = new Set<string>();
  for (const m of i.judgment.matched_skills ?? []) {
    const hit = byLower.get(String(m).toLowerCase().trim());
    if (hit) matchedSet.add(hit);
  }
  const matched = i.requiredSkills.filter((s) => matchedSet.has(s));
  const missing = i.requiredSkills.filter((s) => !matchedSet.has(s));

  const skills = i.requiredSkills.length ? WEIGHTS.skills * (matched.length / i.requiredSkills.length) : 0;

  const years = i.candidate.years ?? 0;
  const experience = WEIGHTS.experience * Math.min(1, years / Math.max(1, i.expectedYears));

  const tier = normalizeTier(i.judgment.designation_tier);
  const designation = DESIGNATION_POINTS[tier];

  const total = skills + experience + designation;

  const tierText = { same: "the same or a very similar role", related: "a related role", unrelated: "an unrelated role" }[tier];
  const cur = i.candidate.designation ? `current title "${i.candidate.designation}" is ${tierText}` : "no current title found";
  const miss = missing.length && missing.length <= 3 ? ` (missing: ${missing.join(", ")})` : "";
  const exp =
    years >= i.expectedYears
      ? `${years} yrs experience meets the ~${i.expectedYears} expected`
      : `${years} yrs experience is below the ~${i.expectedYears} expected`;
  let reason = `Has ${matched.length} of ${i.requiredSkills.length} required skills${miss}; ${exp}; ${cur}.`;
  if (i.judgment.note) reason += ` ${i.judgment.note.trim().replace(/\.?$/, ".")}`;

  return { total: r1(total), skills: r1(skills), experience: r1(experience), designation, matched, missing, reason };
}

// Rule-based fallback if the LLM cannot infer expected years
export function heuristicExpectedYears(title: string): number {
  const t = title.toLowerCase();
  if (/\b(vp|vice president|chief|head of)\b/.test(t)) return 12;
  if (/\bdirector\b/.test(t)) return 10;
  if (/\b(senior|sr\.?|lead|principal)\b/.test(t)) return 7;
  if (/\bmanager\b/.test(t)) return 6;
  if (/\b(engineer|analyst|paralegal|teacher|closer|specialist)\b/.test(t)) return 3;
  return 1; // cashier, cleaner, etc.
}