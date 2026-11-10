CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT,
  phone TEXT,
  current_designation TEXT,
  current_company TEXT,
  total_experience_years NUMERIC(4,1),
  skills TEXT[] NOT NULL DEFAULT '{}',
  raw_text TEXT NOT NULL,
  work_history JSONB,
  education JSONB
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  required_skills TEXT[] NOT NULL DEFAULT '{}',
  expected_years INT
);

CREATE TABLE IF NOT EXISTS matches (
  job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,
  candidate_id TEXT REFERENCES candidates(id) ON DELETE CASCADE,
  total_score NUMERIC(5,1) NOT NULL,
  skills_score NUMERIC(5,1) NOT NULL,
  experience_score NUMERIC(5,1) NOT NULL,
  designation_score NUMERIC(5,1) NOT NULL,
  matched_skills TEXT[] NOT NULL DEFAULT '{}',
  missing_skills TEXT[] NOT NULL DEFAULT '{}',
  reason TEXT,
  rank INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (job_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_matches_job_rank ON matches(job_id, rank);
CREATE INDEX IF NOT EXISTS idx_matches_candidate ON matches(candidate_id);
