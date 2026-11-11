import { config } from "dotenv";
config({ path: ".env.local" });
import { Pool } from "pg";
import { matchJob } from "../src/lib/matcher";
import { inferExpectedYears, scoreBatch } from "../src/lib/llm";

// npm run match                -> all jobs
// npm run match -- 44719       -> one job
// npm run match -- --missing   -> only jobs that have no saved matches yet (resume after an interruption)
async function main() {
  const args = process.argv.slice(2);
  const onlyMissing = args.includes("--missing");
  const ids = args.filter((a) => /^\d+$/.test(a));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    let jobIds = ids;
    if (!jobIds.length) {
      const r = await pool.query(
        onlyMissing
          ? "SELECT id FROM jobs WHERE id NOT IN (SELECT DISTINCT job_id FROM matches) ORDER BY id"
          : "SELECT id FROM jobs ORDER BY id"
      );
      jobIds = r.rows.map((x) => x.id);
    }
    let failed = false;
    for (const id of jobIds) {
      try {
        const s = await matchJob(pool, { inferExpectedYears, scoreBatch }, id, { onProgress: console.log });
        console.log("DONE", s);
      } catch (e) {
        failed = true;
        console.error(`Job ${id} FAILED:`, (e as Error).message);
      }
    }
    if (failed) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});