import Link from "next/link";
import { notFound } from "next/navigation";
import { getJob, getJobMatches } from "@/lib/queries";
import { BackLink, Chips, FactorBar, Notice, ScoreBadge } from "@/components/ui";
import RerunButton from "./RerunButton";

export const instant = false;

export default async function JobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ min?: string }>;
}) {
  const { id } = await params;
  const { min } = await searchParams;
  const minScore = Math.max(0, Math.min(100, Number(min) || 0));

  const job = await getJob(id);
  if (!job) notFound();
  const matches = await getJobMatches(id, minScore);
  const all = minScore > 0 ? await getJobMatches(id, 0) : matches;

  return (
    <div className="space-y-6">
      <BackLink href="/jobs">All jobs</BackLink>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{job.title}</h1>
            <p className="mt-1 text-sm text-slate-600">
              Expected experience (inferred): <b>~{job.expected_years ?? "?"} years</b> · Job ID {job.id}
            </p>
          </div>
          <RerunButton jobId={job.id} />
        </div>
        <div className="mt-4">
          <h2 className="text-sm font-semibold">Required skills</h2>
          <div className="mt-2"><Chips items={job.required_skills} tone="neutral" /></div>
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-indigo-600">Full job description</summary>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-slate-700">{job.description}</pre>
        </details>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xl font-semibold">
            Ranked candidates <span className="text-sm font-normal text-slate-500">({matches.length}{minScore > 0 ? ` of ${all.length}` : ""})</span>
          </h2>
          <form className="flex items-end gap-2" method="GET">
            <label className="text-sm">
              <span className="block text-xs text-slate-500">Minimum score</span>
              <input name="min" type="number" min={0} max={100} defaultValue={minScore || ""} placeholder="0"
                className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm" />
            </label>
            <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100">Apply</button>
            {minScore > 0 && <Link href={`/jobs/${id}`} className="py-1.5 text-sm text-indigo-600 hover:underline">Clear</Link>}
          </form>
        </div>

        {all.length === 0 && (
          <div className="mt-4"><Notice kind="info">This job has not been matched yet. Click <b>Re-run matching</b> or run <code>npm run match -- {job.id}</code>.</Notice></div>
        )}
        {all.length > 0 && matches.length === 0 && (
          <div className="mt-4"><Notice kind="info">No candidates score {minScore} or higher for this job. Try a lower minimum.</Notice></div>
        )}

        <ol className="mt-4 space-y-3">
          {matches.map((m) => (
            <li key={m.candidate_id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-slate-500">#{m.rank}</p>
                  <Link href={`/candidates/${m.candidate_id}`} className="font-semibold text-indigo-700 hover:underline">
                    {m.name ?? `Candidate ${m.candidate_id}`}
                  </Link>
                  <p className="text-sm text-slate-600">
                    {m.current_designation ?? "No title"}{m.current_company ? ` · ${m.current_company}` : ""}
                    {m.total_experience_years != null ? ` · ${m.total_experience_years} yrs` : ""}
                  </p>
                  <p className="text-xs text-slate-400">CV ID {m.candidate_id}</p>
                </div>
                <ScoreBadge score={m.total_score} big />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <FactorBar label="Skills" value={m.skills_score} max={50} />
                <FactorBar label="Experience" value={m.experience_score} max={30} />
                <FactorBar label="Designation" value={m.designation_score} max={20} />
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <div><span className="mr-2 text-xs font-semibold text-emerald-700">Matched</span><Chips items={m.matched_skills} tone="good" /></div>
                <div><span className="mr-2 text-xs font-semibold text-rose-700">Missing</span><Chips items={m.missing_skills} tone="bad" /></div>
              </div>
              {m.reason && <p className="mt-3 text-sm text-slate-700">{m.reason}</p>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}