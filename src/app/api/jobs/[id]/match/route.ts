import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { matchJob } from "@/lib/matcher";
import { inferExpectedYears, scoreBatch } from "@/lib/llm";

export const maxDuration = 300; // seconds; Vercel caps this by plan

const COOLDOWN_SECONDS = 120;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    // protects the free LLM quota from repeated clicks / abuse
    const last = await pool.query("SELECT EXTRACT(EPOCH FROM (now() - MAX(created_at))) AS age FROM matches WHERE job_id=$1", [id]);
    const age = last.rows[0]?.age;
    if (age != null && Number(age) < COOLDOWN_SECONDS) {
      return NextResponse.json(
        { error: `This job was matched ${Math.round(Number(age))}s ago. Please wait ${COOLDOWN_SECONDS - Math.round(Number(age))}s before re-running.` },
        { status: 429 }
      );
    }
    const summary = await matchJob(pool, { inferExpectedYears, scoreBatch }, id);
    return NextResponse.json(summary);
  } catch (e) {
    const msg = (e as Error).message || "Matching failed";
    const status = /not found/i.test(msg) ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}