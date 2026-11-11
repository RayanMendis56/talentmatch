import { config } from "dotenv";
config({ path: ".env.local" });
import { Pool } from "pg";
import { harmonizeTiers, normTitle } from "../src/lib/tiers";
import type { Tier } from "../src/lib/scoring";

const DRY = process.argv.includes("--dry");
const POINTS: Record<Tier, number> = { same: 20, related: 10, unrelated: 0 };
const toTier = (points: number): Tier => (points >= 20 ? "same" : points >= 10 ? "related" : "unrelated");
const TEXT: Record<Tier, string> = {
  same: "is the same or a very similar role",
  related: "is a related role",
  unrelated: "is an unrelated role",
};

interface MatchRow {
  candidate_id: string;
  designation_score: number | string;
  skills_score: number | string;
  experience_score: number | string;
  reason: string | null;
  rank: number;
  current_designation: string | null;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    const jobs = (await pool.query<{ job_id: string }>("SELECT DISTINCT job_id FROM matches ORDER BY job_id")).rows;
    let changed = 0;

    for (const { job_id: jobId } of jobs) {
      const rows = (
        await pool.query<MatchRow>(
          `SELECT m.candidate_id, m.designation_score, m.skills_score, m.experience_score, m.reason, m.rank, c.current_designation
           FROM matches m JOIN candidates c ON c.id = m.candidate_id WHERE m.job_id=$1`,
          [jobId]
        )
      ).rows;
      const tiers = harmonizeTiers(
        rows.map((row) => ({
          designation: row.current_designation,
          tier: toTier(Number(row.designation_score)),
        }))
      );

      const updated = rows.map((row) => {
        const tier = tiers.get(normTitle(row.current_designation)) ?? toTier(Number(row.designation_score));
        const designation = POINTS[tier];
        const total =
          Math.round((Number(row.skills_score) + Number(row.experience_score) + designation) * 10) / 10;
        const reason =
          row.reason?.replace(
            /is (?:the same or a very similar role|a related role|an unrelated role)/,
            TEXT[tier]
          ) ?? null;
        return {
          ...row,
          designation,
          total,
          reason,
          moved: designation !== Number(row.designation_score),
        };
      });

      const changes = updated.filter((row) => row.moved);
      changed += changes.length;
      updated.sort((a, b) => b.total - a.total || a.rank - b.rank);
      console.log(`job ${jobId}: ${changes.length} designation scores changed`);

      if (DRY) {
        changes.slice(0, 6).forEach((row) =>
          console.log(`   ${row.candidate_id} "${row.current_designation}" -> ${row.designation} pts`)
        );
        continue;
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (let index = 0; index < updated.length; index++) {
          const row = updated[index];
          await client.query(
            "UPDATE matches SET designation_score=$1, total_score=$2, reason=$3, rank=$4 WHERE job_id=$5 AND candidate_id=$6",
            [row.designation, row.total, row.reason, index + 1, jobId, row.candidate_id]
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }

    console.log(DRY ? `DRY RUN: ${changed} rows would change.` : `Done: ${changed} rows updated and re-ranked.`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
