import { config } from "dotenv";
config({ path: ".env.local" });
import fs from "fs";
import { Pool } from "pg";

const esc = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    const r = await pool.query(
      `SELECT job_id, rank, candidate_id, total_score, skills_score, experience_score, designation_score, reason
       FROM matches WHERE rank <= 10 ORDER BY job_id, rank`
    );
    const head = "job_id,rank,candidate_id,total_score,skills_score,experience_score,designation_score,reason";
    const lines = r.rows.map((x) =>
      [x.job_id, x.rank, x.candidate_id, x.total_score, x.skills_score, x.experience_score, x.designation_score, x.reason].map(esc).join(",")
    );
    fs.mkdirSync("results", { recursive: true });
    fs.writeFileSync("results/top10.csv", [head, ...lines].join("\n") + "\n");
    console.log(`Wrote results/top10.csv (${lines.length} rows)`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
