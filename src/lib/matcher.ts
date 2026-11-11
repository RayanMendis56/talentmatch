import type { Pool } from "pg";
import { Doc, shortlist } from "./bm25";
import { CandidateForLlm } from "./llm";
import { computeScore, Judgment, ScoreResult } from "./scoring";
import { harmonizeTiers, normTitle } from "./tiers";

export interface LlmApi {
  inferExpectedYears(job: { title: string; description: string }): Promise<number>;
  scoreBatch(job: { title: string; requiredSkills: string[] }, c: CandidateForLlm[]): Promise<Judgment[]>;
}

export interface MatchOptions {
  topN?: number; // shortlist size
  batchSize?: number; // candidates per LLM call
  reinferYears?: boolean;
  onProgress?: (msg: string) => void;
}

export interface MatchSummary {
  jobId: string;
  expectedYears: number;
  shortlisted: number;
  scored: number;
  failed: string[];
}

const CV_CHARS = 2800;

export async function matchJob(pool: Pool, llm: LlmApi, jobId: string, opts: MatchOptions = {}): Promise<MatchSummary> {
  const { topN = 40, batchSize = 5, reinferYears = false, onProgress = () => {} } = opts;

  const jr = await pool.query("SELECT * FROM jobs WHERE id=$1", [jobId]);
  if (!jr.rowCount) throw new Error(`Job ${jobId} not found`);
  const job = jr.rows[0] as { id: string; title: string; description: string; required_skills: string[]; expected_years: number | null };

  // expected years: infer once, cache in the jobs table
  let expectedYears = job.expected_years;
  if (expectedYears == null || reinferYears) {
    expectedYears = await llm.inferExpectedYears({ title: job.title, description: job.description });
    await pool.query("UPDATE jobs SET expected_years=$1 WHERE id=$2", [expectedYears, jobId]);
  }
  onProgress(`[${jobId}] ${job.title}: expected years = ${expectedYears}`);

  // stage 1: shortlist
  const cr = await pool.query(
    "SELECT id, current_designation, total_experience_years, skills, raw_text, work_history FROM candidates"
  );
  const rows = cr.rows as {
    id: string; current_designation: string | null; total_experience_years: string | null;
    skills: string[]; raw_text: string; work_history: { title: string }[] | null;
  }[];
  const docs: Doc[] = rows.map((r) => ({
    id: r.id,
    designation: r.current_designation,
    roleTitles: (r.work_history ?? []).map((w) => w.title),
    skills: r.skills,
    rawText: r.raw_text,
  }));
  const hits = shortlist(docs, { title: job.title, description: job.description, requiredSkills: job.required_skills }, topN);
  const byId = new Map(rows.map((r) => [r.id, r]));
  onProgress(`[${jobId}] shortlisted ${hits.length} of ${rows.length}`);

  // stage 2: LLM judgments in batches
  const judgments = new Map<string, Judgment>();
  const failed: string[] = [];
  for (let i = 0; i < hits.length; i += batchSize) {
    const slice = hits.slice(i, i + batchSize).map((h) => byId.get(h.id)!);
    const payload: CandidateForLlm[] = slice.map((r) => ({
      id: r.id,
      designation: r.current_designation,
      years: r.total_experience_years == null ? null : Number(r.total_experience_years),
      skills: r.skills,
      cvText: r.raw_text.slice(0, CV_CHARS),
    }));
    try {
      let out = await llm.scoreBatch({ title: job.title, requiredSkills: job.required_skills }, payload);
      const got = new Set(out.map((o) => o.candidate_id));
      const lost = payload.filter((p) => !got.has(p.id)); // retry anyone the model skipped
      if (lost.length) out = out.concat(await llm.scoreBatch({ title: job.title, requiredSkills: job.required_skills }, lost));
      for (const o of out) if (payload.some((p) => p.id === o.candidate_id)) judgments.set(o.candidate_id, o);
    } catch (e) {
      onProgress(`[${jobId}] batch ${i / batchSize + 1} failed: ${(e as Error).message}`);
    }
    onProgress(`[${jobId}] judged ${Math.min(i + batchSize, hits.length)}/${hits.length}`);
  }
  for (const h of hits) if (!judgments.has(h.id)) failed.push(h.id);
  if (!judgments.size) throw new Error("LLM scoring failed for every candidate; old results were kept.");
  if (failed.length > hits.length * 0.2) {
    throw new Error(
      `LLM scoring failed for ${failed.length}/${hits.length} candidates (likely quota or rate limit); old results were kept.`
    );
  }

  const tierByTitle = harmonizeTiers(
    [...judgments.entries()].map(([candidateId, judgment]) => ({
      designation: byId.get(candidateId)?.current_designation ?? null,
      tier: judgment.designation_tier,
    }))
  );
  for (const [candidateId, judgment] of judgments) {
    const tier = tierByTitle.get(normTitle(byId.get(candidateId)?.current_designation));
    if (tier) judgment.designation_tier = tier;
  }

  // numbers come from code, not the LLM
  const scored: { id: string; bm: number; s: ScoreResult }[] = [];
  for (const h of hits) {
    const j = judgments.get(h.id);
    if (!j) continue;
    const r = byId.get(h.id)!;
    scored.push({
      id: h.id,
      bm: h.score,
      s: computeScore({
        jobTitle: job.title,
        requiredSkills: job.required_skills,
        expectedYears,
        candidate: { designation: r.current_designation, years: r.total_experience_years == null ? null : Number(r.total_experience_years) },
        judgment: j,
      }),
    });
  }
  scored.sort((a, b) => b.s.total - a.s.total || b.bm - a.bm);

  // save atomically: replace this job's results only after everything succeeded
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM matches WHERE job_id=$1", [jobId]);
    for (let i = 0; i < scored.length; i++) {
      const { id, s } = scored[i];
      await client.query(
        `INSERT INTO matches (job_id, candidate_id, total_score, skills_score, experience_score, designation_score,
           matched_skills, missing_skills, reason, rank)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [jobId, id, s.total, s.skills, s.experience, s.designation, s.matched, s.missing, s.reason, i + 1]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  onProgress(`[${jobId}] saved ${scored.length} matches (${failed.length} failed)`);
  return { jobId, expectedYears, shortlisted: hits.length, scored: scored.length, failed };
}