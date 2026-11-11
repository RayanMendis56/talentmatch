// Stage 1: cheap shortlist. BM25 over each candidate's text + a boost for title overlap.

const STOP = new Set(
  "a an the and or of to in for with on at by from as is are be was were this that these those it its your you we our their will can may must should have has had not but if than then into across per via such including include etc".split(" ")
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t)); // light plural stemming
}

export interface Doc {
  id: string;
  designation: string | null;
  roleTitles: string[];
  skills: string[];
  rawText: string;
}

export interface JobQuery {
  title: string;
  description: string;
  requiredSkills: string[];
}

function docTokens(d: Doc): string[] {
  // designation and role titles are repeated so they weigh more than body text
  const head = `${d.designation ?? ""} `.repeat(3) + d.roleTitles.join(" ") + " " + d.skills.join(" ");
  return tokenize(head + " " + d.rawText);
}

export interface ShortlistHit {
  id: string;
  bm25: number;
  titleOverlap: number;
  score: number;
}

export function shortlist(docs: Doc[], job: JobQuery, topN = 40): ShortlistHit[] {
  const k1 = 1.5, b = 0.75;
  const toks = docs.map(docTokens);
  const N = docs.length;
  const avgLen = toks.reduce((s, t) => s + t.length, 0) / N;

  const df = new Map<string, number>();
  for (const t of toks) for (const w of new Set(t)) df.set(w, (df.get(w) ?? 0) + 1);

  // query: title weighted x3, skills x2, description x1
  const q = new Map<string, number>();
  const add = (words: string[], w: number) => words.forEach((t) => q.set(t, (q.get(t) ?? 0) + w));
  add(tokenize(job.title), 3);
  add(tokenize(job.requiredSkills.join(" ")), 2);
  add(tokenize(job.description), 1);

  const titleToks = new Set(tokenize(job.title));
  const raw = docs.map((d, i) => {
    const tf = new Map<string, number>();
    for (const t of toks[i]) tf.set(t, (tf.get(t) ?? 0) + 1);
    let s = 0;
    for (const [term, qw] of q) {
      const f = tf.get(term);
      if (!f) continue;
      const idf = Math.log(1 + (N - (df.get(term) ?? 0) + 0.5) / ((df.get(term) ?? 0) + 0.5));
      s += qw * idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * toks[i].length) / avgLen)));
    }
    // title overlap: share of job-title words found in the current designation / past role titles
    const own = new Set(tokenize([d.designation ?? "", ...d.roleTitles].join(" ")));
    const cur = new Set(tokenize(d.designation ?? ""));
    let hit = 0, hitCur = 0;
    for (const t of titleToks) { if (own.has(t)) hit++; if (cur.has(t)) hitCur++; }
    const overlap = titleToks.size ? (0.6 * hitCur + 0.4 * hit) / titleToks.size : 0;
    return { id: d.id, bm25: s, titleOverlap: overlap };
  });

  const max = Math.max(...raw.map((r) => r.bm25)) || 1;
  return raw
    .map((r) => ({ ...r, score: r.bm25 / max + 0.6 * r.titleOverlap }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}