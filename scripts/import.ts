import { config } from "dotenv";
config({ path: ".env.local" });
import fs from "fs";
import path from "path";
import { Pool } from "pg";
import { parseCv } from "../src/lib/parseCv";
import { parseJob } from "../src/lib/parseJob";

// Usage:
//   npm run import            -> parse and write to the database
//   npm run import -- --dry   -> parse only, print a report + sample profiles to verify by hand
const DRY = process.argv.includes("--dry");
const DATA_DIR = process.env.DATA_DIR;
if (!DATA_DIR) throw new Error("Set DATA_DIR in .env.local (folder containing corpus/ and queries/)");

const readDir = (sub: string) =>
  fs
    .readdirSync(path.join(DATA_DIR, sub))
    .filter((f) => !f.startsWith("."))
    .map((id) => ({ id, text: fs.readFileSync(path.join(DATA_DIR, sub, id), "utf8") }));

async function main() {
  const candidates = readDir("corpus").map((f) => parseCv(f.id, f.text));
  const jobs = readDir("queries").map((f) => parseJob(f.id, f.text));

  // ---- report ----
  const missing = (k: keyof (typeof candidates)[0]) =>
    candidates.filter((c) => c[k] == null || (Array.isArray(c[k]) && !(c[k] as unknown[]).length)).length;
  console.log(`Parsed ${candidates.length} candidates, ${jobs.length} jobs`);
  console.log(
    `Missing -> email:${missing("email")} phone:${missing("phone")} designation:${missing("currentDesignation")} ` +
      `company:${missing("currentCompany")} years:${missing("totalExperienceYears")} skills:${missing("skills")}`
  );
  for (const j of jobs) console.log(`  job ${j.id}: ${j.title} (${j.requiredSkills.length} skills)`);

  if (DRY) {
    // 8 random profiles to compare by hand against the raw CV files
    const sample = [...candidates].sort(() => Math.random() - 0.5).slice(0, 8);
    for (const c of sample) {
      const { workHistory, skills } = c;
      console.log("\n--- CV file:", c.id);
      console.log({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        currentDesignation: c.currentDesignation,
        currentCompany: c.currentCompany,
        totalExperienceYears: c.totalExperienceYears,
      });
      console.log("roles:", workHistory.map((r) => `${r.title} @ ${r.company} (${r.start} -> ${r.end})`));
      console.log("skills:", skills.slice(0, 8), skills.length > 8 ? `... (+${skills.length - 8})` : "");
    }
    return;
  }

  // ---- write ----
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const j of jobs) {
      await client.query(
        `INSERT INTO jobs (id, title, description, required_skills)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description,
           required_skills=EXCLUDED.required_skills`,
        [j.id, j.title, j.description, j.requiredSkills]
      );
    }
    for (const c of candidates) {
      await client.query(
        `INSERT INTO candidates (id, name, email, phone, current_designation, current_company,
           total_experience_years, skills, raw_text, work_history)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, email=EXCLUDED.email, phone=EXCLUDED.phone,
           current_designation=EXCLUDED.current_designation, current_company=EXCLUDED.current_company,
           total_experience_years=EXCLUDED.total_experience_years, skills=EXCLUDED.skills,
           raw_text=EXCLUDED.raw_text, work_history=EXCLUDED.work_history`,
        [c.id, c.name, c.email, c.phone, c.currentDesignation, c.currentCompany,
         c.totalExperienceYears, c.skills, c.rawText, JSON.stringify(c.workHistory)]
      );
    }
    await client.query("COMMIT");
    console.log(`Imported ${jobs.length} jobs and ${candidates.length} candidates.`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });