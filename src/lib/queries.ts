import { pool } from "./db";

const num = (v: unknown) => (v == null ? null : Number(v));

export interface JobSummary {
  id: string;
  title: string;
  expected_years: number | null;
  skill_count: number;
  matched: number;
  top_score: number | null;
}

export async function listJobs(): Promise<JobSummary[]> {
  const r = await pool.query(
    `SELECT j.id, j.title, j.expected_years, COALESCE(array_length(j.required_skills,1),0) AS skill_count,
            COUNT(m.candidate_id)::int AS matched, MAX(m.total_score) AS top_score
     FROM jobs j LEFT JOIN matches m ON m.job_id = j.id
     GROUP BY j.id ORDER BY j.title`
  );
  return r.rows.map((x) => ({ ...x, top_score: num(x.top_score), skill_count: Number(x.skill_count) }));
}

export async function getJob(id: string) {
  const r = await pool.query("SELECT * FROM jobs WHERE id=$1", [id]);
  return r.rows[0] as
    | { id: string; title: string; description: string; required_skills: string[]; expected_years: number | null }
    | undefined;
}

export interface JobMatch {
  rank: number;
  candidate_id: string;
  name: string | null;
  current_designation: string | null;
  current_company: string | null;
  total_experience_years: number | null;
  total_score: number;
  skills_score: number;
  experience_score: number;
  designation_score: number;
  matched_skills: string[];
  missing_skills: string[];
  reason: string | null;
  created_at: string;
}

export async function getJobMatches(jobId: string, minScore = 0): Promise<JobMatch[]> {
  const r = await pool.query(
    `SELECT m.rank, m.candidate_id, c.name, c.current_designation, c.current_company, c.total_experience_years,
            m.total_score, m.skills_score, m.experience_score, m.designation_score,
            m.matched_skills, m.missing_skills, m.reason, m.created_at
     FROM matches m JOIN candidates c ON c.id = m.candidate_id
     WHERE m.job_id=$1 AND m.total_score >= $2
     ORDER BY m.rank`,
    [jobId, minScore]
  );
  return r.rows.map((x) => ({
    ...x,
    total_score: Number(x.total_score),
    skills_score: Number(x.skills_score),
    experience_score: Number(x.experience_score),
    designation_score: Number(x.designation_score),
    total_experience_years: num(x.total_experience_years),
  }));
}

export interface CandidateRow {
  id: string;
  name: string | null;
  current_designation: string | null;
  current_company: string | null;
  total_experience_years: number | null;
  best_score: number | null;
}

export async function searchCandidates(q: string): Promise<{ rows: CandidateRow[]; total: number }> {
  const like = `%${q.trim()}%`;
  const r = await pool.query(
    `SELECT c.id, c.name, c.current_designation, c.current_company, c.total_experience_years,
            (SELECT MAX(total_score) FROM matches WHERE candidate_id = c.id) AS best_score
     FROM candidates c
     WHERE $1 = '' OR c.id = $1 OR c.name ILIKE $2 OR c.current_designation ILIKE $2
        OR c.current_company ILIKE $2 OR array_to_string(c.skills, ' ') ILIKE $2
     ORDER BY c.name NULLS LAST, c.id
     LIMIT 200`,
    [q.trim(), like]
  );
  const t = await pool.query("SELECT COUNT(*)::int AS n FROM candidates");
  return {
    rows: r.rows.map((x) => ({ ...x, total_experience_years: num(x.total_experience_years), best_score: num(x.best_score) })),
    total: t.rows[0].n,
  };
}

export async function getCandidate(id: string) {
  const r = await pool.query("SELECT * FROM candidates WHERE id=$1", [id]);
  return r.rows[0] as
    | {
        id: string; name: string | null; email: string | null; phone: string | null;
        current_designation: string | null; current_company: string | null;
        total_experience_years: string | null; skills: string[]; raw_text: string;
        work_history: { title: string; company: string | null; start: string; end: string; isCurrent: boolean }[] | null;
      }
    | undefined;
}

export interface CandidateMatch {
  job_id: string;
  title: string;
  rank: number;
  total_score: number;
  skills_score: number;
  experience_score: number;
  designation_score: number;
  matched_skills: string[];
  missing_skills: string[];
  reason: string | null;
}

export async function getCandidateMatches(candidateId: string): Promise<CandidateMatch[]> {
  const r = await pool.query(
    `SELECT m.job_id, j.title, m.rank, m.total_score, m.skills_score, m.experience_score, m.designation_score,
            m.matched_skills, m.missing_skills, m.reason
     FROM matches m JOIN jobs j ON j.id = m.job_id
     WHERE m.candidate_id=$1 ORDER BY m.total_score DESC`,
    [candidateId]
  );
  return r.rows.map((x) => ({
    ...x,
    total_score: Number(x.total_score),
    skills_score: Number(x.skills_score),
    experience_score: Number(x.experience_score),
    designation_score: Number(x.designation_score),
  }));
}