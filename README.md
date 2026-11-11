# TalentMatch

A small recruitment app where an AI matching agent ranks candidate CVs against 10 job descriptions. Each candidate gets a score out of 100 (skills 50 · experience 30 · designation 20) and a specific one-line reason. A recruiter opens a job and sees every shortlisted candidate ranked by fit.

- **Live app:** https://talentmatch-ebon.vercel.app
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
| `GEMINI_MODEL` | Gemini model name (default `gemini-3.5-flash-lite`) |
| `LLM_MIN_GAP_MS` | Minimum delay between LLM calls, to respect free-tier rate limits (default 4500) |
| `MATCH_TOP_N` | Candidate shortlist size per job (default 40) |
| `MATCH_BATCH_SIZE` | Candidates judged per LLM call (default 5) |
| `DATA_DIR` | Local folder that contains `corpus/` and `queries/` (import only) |

The provided data folders are **not** committed. Keep them outside the repository, for example in `~/talentmatch-data/corpus/` and `~/talentmatch-data/queries/`, and set `DATA_DIR` in `.env.local` to the absolute path of `~/talentmatch-data`. The import script loads `.env.local` itself. The full import reads all 472 CV files and all 10 job files. Candidate IDs are the CV filenames; no candidate subset was selected for the submitted matching run.

### Useful commands

| Command | What it does |
|---|---|
| `npm run import -- --dry` | Parse only, no database writes: prints a report and 8 random profiles to check by hand |
| `npm run import -- --dry --limit 20` | Preview the first 20 CVs in sorted filename order and all job files |
| `npm run import -- --limit 20` | Import only the first 20 CVs in sorted filename order, but all job files |
| `npm run import` | Parse and upsert jobs and candidates (safe to re-run) |
| `npm run match` | Match all jobs |
| `npm run match -- 44719` | Match a single job |
| `npm run match -- --missing` | Match only jobs that have no saved results (resume after an interruption) |
| `npm run export` | Regenerate `results/top10.csv` from the database |
| `npm run normalize -- --dry` | Preview consistent designation tiers for saved matches |
| `npm run normalize` | Apply consistent designation tiers and re-rank saved matches (no LLM calls) |

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

**Verification:** the import has a `--dry` mode that reports missing fields and prints eight sample profiles for manual comparison with the raw CV files. I also checked that extracted designations and companies appeared in their CV text and reviewed sample profiles by hand. There is no automated test suite in this repository.

To try a smaller import, use `--limit N`. It selects the first N CV filenames in sorted order and still imports all job files; `--dry` previews the parse without writing. For example, `npm run import -- --dry --limit 20` previews 20 CVs. The submitted run used all 472 CVs, with IDs taken from their filenames rather than choosing a hand-picked ID list.

Jobs: the title is the first line (job 46795 has none, so it is read from "We are seeking a … to join"), and required skills are the bullets under `Required Skills` / `About Required Skills`.

---

## Step 2: How matching works

A two-stage pipeline. The LLM makes **judgments only**; all **numbers are computed in code**, so the 50/30/20 rules are always followed exactly.

### Stage 0: Expected years per job
Jobs do not state years. One LLM call per job estimates the minimum years a hiring manager would expect, from the seniority in the title and the responsibilities (entry-level 0–1, individual contributor 2–5, "Senior" 6–8, manager 5–8, director 10–12). The value is cached in `jobs.expected_years` and shown in the UI. If the call fails, a rule-based fallback on title keywords is used.

Inferred values:

| Job ID | Title | Expected years |
|---|---|---:|
| 29243 | Healthcare Data Analyst | 2 |
| 32447 | Senior Mechanical/HVAC Engineer | 7 |
| 35129 | IELTS Teacher | 3 |
| 36044 | Failure Analysis Engineer | 3 |
| 37020 | Regional Facilities Manager | 6 |
| 38671 | Retail Mortgage Loan Closer | 3 |
| 39060 | Sales Director, ProductFE | 10 |
| 44719 | Cashier | 1 |
| 46795 | Paralegal, Privacy and Information Management | 3 |
| 47576 | Housekeeping Cleaner | 1 |

### Stage 1: Shortlist (fast, free)
BM25 over all 472 CVs for each job. The query is the job title (weight 3), required skills (2) and description (1); a candidate's document is their current title (repeated for weight), past role titles, skills and full CV text. A boost is added when the job-title words appear in the candidate's current title or past titles. `MATCH_TOP_N` controls the shortlist (default 40). In the submitted results, the first two jobs used a top-40 shortlist (Healthcare persisted 35 successful judgments and Cashier 40); the remaining eight used a top-30 shortlist with `MATCH_BATCH_SIZE=10` to conserve free-tier quota.

### Stage 2: LLM judgments
Candidates are sent in configurable batches (default 5; the eight quota-constrained runs used 10) with their title, years, skills and CV text. For each one the model returns, as strict JSON:
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
For each job, candidates with successful judgments from the configured shortlist are stored in the `matches` table with the total, the three factor scores, matched and missing skills, the reason and the rank (so well beyond the required top 10). If more than 20% of judgments fail, the old results are kept; otherwise, results are replaced in a single transaction. Pages read from the database and never re-score on load.

### Weak fits score low
Candidates outside the shortlist are not scored. IELTS Teacher is a weak fit: no CV mentions IELTS, and the leading candidates' scores come from generic teaching skills rather than IELTS-specific evidence. The IELTS requirement appears as missing, and scores are not forced upward.

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

- **Google Gemini API** for matching judgments and expected-years inference. The eight remaining jobs were successfully run with `gemini-3.5-flash-lite`, which is also the code default. Earlier, `gemini-2.5-flash` was unavailable and `gemini-3.8-flash` hit its daily free-tier quota.
- **Claude** (Anthropic) as an AI coding assistant while building the parsers, scoring logic and UI. I reviewed and tested the generated code and can explain every part.
- **Neon** (PostgreSQL) for the hosted database and **Vercel** for hosting.

---

## Extras

- **Deterministic number-crunching:** the LLM only judges; code computes scores, so rules are verifiable.
- **Resumable matching** (`--missing` skips jobs that already have saved results) and **atomic result replacement** (a failed run keeps the prior job results).
- **Re-run cooldown** (2 minutes per job) to protect the free LLM quota.
- **Import dry-run** with a data-quality report.
- Candidate search across skills and CV IDs.
- Designation-tier consistency by title; `npm run normalize -- --dry` previews repairs to saved matches and `npm run normalize` applies them without LLM calls.

## Known limitations

- The designation tier is an LLM judgment and can occasionally be debatable for borderline "related" roles. Within each job, candidates with the same normalized current title use the majority tier; ties use the lower tier. `npm run normalize -- --dry` previews this repair for saved results, and `npm run normalize` applies it without LLM calls.
- Only shortlisted candidates are scored (default 40; 30 for eight of the submitted jobs); a strong candidate with unusual wording could, in principle, fall outside the shortlist.
- The source corpus contains near-duplicate CVs. They remain separate candidate IDs and can therefore occupy multiple top-ten positions.
- The CV parser is tuned to the layouts found in this dataset; very different layouts would need new patterns.
- On Vercel's free plan, a function time limit may stop the in-app **Re-run matching** for slow runs; the script (`npm run match -- <jobId>`) is the fallback.

## With more time

- Let recruiters adjust the 50/30/20 weights (recompute totals from the stored factor scores with no new LLM calls).
- Compare two matching approaches (BM25 only vs BM25 + LLM) and report which ranks better.
- Embedding-based shortlist to catch synonyms BM25 misses.
- Side-by-side candidate comparison, work-history/education timeline.
- Upload a new CV or add a job and match it live.
- Authentication, automated tests and a background job queue for matching.
