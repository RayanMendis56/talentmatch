export interface ParsedJob {
  id: string;
  title: string;
  description: string;
  requiredSkills: string[];
}

// Fallback titles from the assignment brief (used only if parsing fails)
export const KNOWN_TITLES: Record<string, string> = {
  "29243": "Healthcare Data Analyst",
  "32447": "Senior Mechanical/HVAC Engineer",
  "35129": "IELTS Teacher",
  "36044": "Failure Analysis Engineer",
  "37020": "Regional Facilities Manager",
  "38671": "Retail Mortgage Loan Closer",
  "39060": "Sales Director, ProductFE",
  "44719": "Cashier",
  "46795": "Paralegal, Privacy and Information Management",
  "47576": "Housekeeping Cleaner",
};

const SKILLS_HEADING = /^(about\s+)?required\s+skills\s*:?\s*$/i;

export function parseJob(id: string, raw: string): ParsedJob {
  const text = raw.replace(/\r\n/g, "\n").trim();
  const lines = text.split("\n");
  const first = lines[0].trim();

  // Title: the first line, unless it is a sentence ("We are seeking a X to join ...")
  let title = first;
  const sentence = first.match(/seeking (?:an? )?(.+?) to join/i);
  if (sentence) title = sentence[1].trim();
  else if (first.length > 80 || /[.!?]$/.test(first)) title = KNOWN_TITLES[id] ?? first;

  // Required skills: bullet lines after the heading, until the first blank line after the bullets start
  const requiredSkills: string[] = [];
  const idx = lines.findIndex((l) => SKILLS_HEADING.test(l.trim()));
  if (idx >= 0) {
    let started = false;
    for (let i = idx + 1; i < lines.length; i++) {
      const t = lines[i].trim();
      if (/^[-•*]\s+/.test(t)) {
        started = true;
        requiredSkills.push(t.replace(/^[-•*]\s+/, "").trim());
      } else if (!t) {
        if (started) break;
      } else if (started) break; // a new heading
      // else: intro sentence such as "The following core competencies apply:" -> skip
    }
  }
  return { id, title, description: text, requiredSkills };
}