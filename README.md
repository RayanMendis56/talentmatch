# TalentMatch

A small recruitment app where an AI matching agent ranks candidate CVs against 10 job descriptions. Each candidate gets a score out of 100 (skills 50 · experience 30 · designation 20) and a specific one-line reason. A recruiter opens a job and sees every shortlisted candidate ranked by fit.

- **Live app:** TODO: https://talentmatch-ebon.vercel.app
- **Repository:** https://github.com/RayanMendis56/talentmatch
- **Matching results:** [`results/top10.csv`](results/top10.csv)

**Stack:** Next.js (App Router, TypeScript, Node.js) · Tailwind CSS · PostgreSQL on Neon · Google Gemini · hosted on Vercel.

---

## Run locally

```bash
git clone https://github.com/RayanMendis56/talentmatch.git
cd talentmatch
npm install
cp .env.example .env.local      # then fill in the values
npm run db:migrate              # creates the tables
npm run import                  # loads the jobs and CVs (see below)
npm run match                   # scores every job (about 10 min on the free LLM tier)
npm run export                  # writes results/top10.csv
npm run dev                     # http://localhost:3000
```

### Environment variables (`.env.example`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Neon pooled string works) |
| `GEMINI_API_KEY` | Google AI Studio key |
| `GEMINI_MODEL` | Gemini model name, e.g. `gemini-2.5-flash` |
| `LLM_MIN_GAP_MS` | Minimum delay between LLM calls, to respect free-tier rate limits (default 4500) |
| `DATA_DIR` | Local folder that contains `corpus/` and `queries/` (import only) |

The provided data folders are **not** committed. Point `DATA_DIR` at them and run the import.

### Useful commands

| Command | What it does |
|---|---|
| `npm run import -- --dry` | Parse only, no database writes: prints a report and 8 random profiles to check by hand |
| `npm run import` | Parse and upsert jobs and candidates (safe to re-run) |
| `npm run match` | Match all jobs |
| `npm run match -- 44719` | Match a single job |
| `npm run match -- --missing` | Match only jobs that have no saved results (resume after an interruption) |
| `npm run export` | Regenerate `results/top10.csv` from the database |

---

## Step 1: How CV details were extracted

I used **plain parsing with regular expressions, with no LLM**, so extraction is deterministic, free and easy to audit. All **472 CVs** were loaded (no smaller subset).

- **Candidate ID** is always the file name. The 472 CVs share only 242 distinct names, and some identical names/emails belong to genuinely different CVs, so name and email are never used as keys.
- **Name:** first non-empty line. **Email / phone:** regex (phone searched in the header block only).
- **Sections:** the CV is split on a list of known headings (`PROFESSIONAL EXPERIENCE`, `WORK HISTORY`, `SKILLS`, `TECHNICAL SKILLS`, `CORE COMPETENCIES`, …) in upper or title case.
- **Roles:** found by their date ranges (`January 2021 – Present`, `June 2018 - December 2020`, plain years too). Three layouts are handled: `Title / Company – City / dates`, `Company / Title ........ dates` and `Company | City | dates`.
- **Current designation and company:** the role with the latest end date ("Present" counts as today).
- **Total experience:** computed in code, not by an LLM. Date ranges are converted to months, **overlapping roles are merged so they count once**, and the total is divided by 12.
- **Skills:** the skills-type sections, with `Category:` prefixes removed and lists split on commas, semicolons and bullets.
- **Missing details** stay empty (shown as "not found in CV"); nothing is invented.

**Verification:** the import has a `--dry` mode. After parsing, every extracted designation and company was checked automatically to appear verbatim in its CV text (472 of 472), no required field was empty, and I compared random profiles against the raw files by hand. Overlap merging is covered by a small test (two overlapping 24-month roles count as 36 months, not 48).

Jobs: the title is the first line (job 46795 has none, so it is read from "We are seeking a … to join"), and required skills are the bullets under `Required Skills` / `About Required Skills`.

---

## Step 2: How matching works

A two-stage pipeline. The LLM makes **judgments only**; all **numbers are computed in code**, so the 50/30/20 rules are always followed exactly.

### Stage 0: Expected years per job
Jobs do not state years. One LLM call per job estimates the minimum years a hiring manager would expect, from the seniority in the title and the responsibilities (entry-level 0–1, individual contributor 2–5, "Senior" 6–8, manager 5–8, director 10–12). The value is cached in `jobs.expected_years` and shown in the UI. If the call fails, a rule-based fallback on title keywords is used.

Inferred values:

TODO: paste the output of `select id, title, expected_years from jobs;` as a table

### Stage 1: Shortlist (fast, free)
BM25 over all 472 CVs for each job. The query is the job title (weight 3), required skills (2) and description (1); a candidate's document is their current title (repeated for weight), past role titles, skills and full CV text. A boost is added when the job-title words appear in the candidate's current title or past titles. The **top 40** per job go to Stage 2.

### Stage 2: LLM judgments
Candidates are sent in batches of 5 with their title, years, skills and CV text. For each one the model returns, as strict JSON:
- `matched_skills`: which of the job's required skills the candidate demonstrates in their skills list **or** work history. Equivalent wording counts ("POS Systems Operation" ≈ "operated the cash register"; "ETL" ≈ "Extract, Transform, Load"), but only with evidence in the CV.
- `designation_tier`: `same`, `related` or `unrelated`, comparing the current title with the job title.
- `note`: a short factual phrase on the strongest evidence or main gap.

The CV text is treated as untrusted data in the prompt (instructions inside a CV are ignored).

### Scoring (computed in code, `src/lib/scoring.ts`)

| Factor | Points | Rule |
|---|---|---|
| Skills | 50 | `50 × matched / required`. Matched names are validated against the job's list, so invented skills are discarded. |
| Experience | 30 | `30 × min(1, candidate_years / expected_years)`: full points at or above the expected years, proportionally fewer below. |
| Designation | 20 | same/very similar = 20, related = 10, unrelated = 0. |

The **reason** is assembled from the verified facts plus the model's note, so it can never contradict the scores, e.g.
*"Has 4 of 5 required skills (missing: Shelf Restocking); 8.3 yrs experience meets the ~1 expected; current title "Cashier" is the same or a very similar role."*

### Saved results
For each job, all 40 shortlisted candidates are scored and stored in the `matches` table with the total, the three factor scores, matched and missing skills, the reason and the rank (so well beyond the required top 10). Results for a job are replaced in a single transaction, so a failed run never wipes good data. Pages read from the database and never re-score on load.

### Weak fits score low
Candidates outside the shortlist are not scored. For jobs with no real fits (for example IELTS Teacher: no CV mentions IELTS) the best candidates simply receive low totals. Scores are not forced upward.

---

## Step 3: Web app

- **Jobs:** list of the 10 jobs; each job page shows the description, required skills, inferred expected years and ranked candidates with total score, three factor bars, matched/missing skills and the reason. Includes a **minimum-score filter** and a **Re-run matching** button.
- **Candidates:** searchable list (name, title, company, skill or CV ID). A candidate page shows the extracted profile, work history, raw CV text and best-matching jobs with scores.
- **Errors and empty states:** clear messages when a job is not matched yet, no results pass the filter, a search finds nothing, an ID does not exist, the database fails, or the LLM call fails.
- Responsive layout with Tailwind (cards instead of wide tables, so it is usable on mobile).

### Database tables
`candidates` (profile fields, skills array, raw text, work history JSON) · `jobs` (title, description, required skills, inferred expected years) · `matches` (job_id + candidate_id key, factor scores, matched/missing skills, reason, rank).

---

## AI tools and APIs used

- **Google Gemini API** (free tier) for the matching judgments and expected-years inference.
- **Claude** (Anthropic) as an AI coding assistant while building the parsers, scoring logic and UI. I reviewed and tested the generated code and can explain every part.
- **Neon** (PostgreSQL) for the hosted database and **Vercel** for hosting.

---

## Extras

- **Deterministic number-crunching:** the LLM only judges; code computes scores, so rules are verifiable.
- **Resumable matching** (`--missing`) and **atomic result replacement.**
- **Re-run cooldown** (2 minutes per job) to protect the free LLM quota.
- **Import dry-run** with a data-quality report.
- Candidate search across skills and CV IDs.

## Known limitations

- The designation tier is an LLM judgment and can occasionally be debatable for borderline "related" roles.
- Only the shortlisted 40 candidates per job are scored; a strong candidate with unusual wording could, in principle, fall outside the shortlist.
- The CV parser is tuned to the layouts found in this dataset; very different layouts would need new patterns.
- On Vercel's free plan, a function time limit may stop the in-app **Re-run matching** for slow runs; the script (`npm run match -- <jobId>`) is the fallback.

## With more time

- Let recruiters adjust the 50/30/20 weights (recompute totals from the stored factor scores with no new LLM calls).
- Compare two matching approaches (BM25 only vs BM25 + LLM) and report which ranks better.
- Embedding-based shortlist to catch synonyms BM25 misses.
- Side-by-side candidate comparison, work-history/education timeline.
- Upload a new CV or add a job and match it live.
- Authentication, automated tests and a background job queue for matching.
