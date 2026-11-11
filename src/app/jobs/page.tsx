import Link from "next/link";
import { listJobs } from "@/lib/queries";
import { Notice, ScoreBadge } from "@/components/ui";

export const instant = false;

export default async function JobsPage() {
  const jobs = await listJobs();
  return (
    <div>
      <h1 className="text-2xl font-bold">Jobs</h1>
      <p className="mt-1 text-sm text-slate-600">Open a job to see every shortlisted candidate ranked by fit.</p>
      {!jobs.length && (
        <div className="mt-4"><Notice kind="info">No jobs yet. Run <code>npm run import</code> first.</Notice></div>
      )}
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {jobs.map((j) => (
          <li key={j.id}>
            <Link href={`/jobs/${j.id}`} className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-300 hover:shadow">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold leading-snug">{j.title}</h2>
                {j.matched > 0 ? <ScoreBadge score={j.top_score} /> : null}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {j.skill_count} required skills · expects ~{j.expected_years ?? "?"} yrs · ID {j.id}
              </p>
              <p className="mt-2 text-xs">
                {j.matched > 0 ? (
                  <span className="text-emerald-700">{j.matched} candidates ranked · top score shown</span>
                ) : (
                  <span className="text-amber-700">Not matched yet</span>
                )}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}