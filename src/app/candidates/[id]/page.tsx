import Link from "next/link";
import { notFound } from "next/navigation";
import { getCandidate, getCandidateMatches } from "@/lib/queries";
import { BackLink, Chips, FactorBar, Notice, ScoreBadge } from "@/components/ui";

export const instant = false;

const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className="text-sm">{value || <span className="text-slate-400">not found in CV</span>}</dd>
  </div>
);

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getCandidate(id);
  if (!c) notFound();
  const matches = await getCandidateMatches(id);

  return (
    <div className="space-y-6">
      <BackLink href="/candidates">All candidates</BackLink>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-bold">{c.name ?? `Candidate ${c.id}`}</h1>
        <p className="text-xs text-slate-400">CV ID {c.id}</p>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Email" value={c.email} />
          <Field label="Phone" value={c.phone} />
          <Field label="Total experience" value={c.total_experience_years != null ? `${c.total_experience_years} years` : null} />
          <Field label="Current designation" value={c.current_designation} />
          <Field label="Current company" value={c.current_company} />
        </dl>
        <div className="mt-4">
          <h2 className="text-sm font-semibold">Skills</h2>
          <div className="mt-2"><Chips items={c.skills} tone="neutral" /></div>
        </div>
        {c.work_history && c.work_history.length > 0 && (
          <div className="mt-4">
            <h2 className="text-sm font-semibold">Work history</h2>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {c.work_history.map((w, i) => (
                <li key={i}>
                  <b>{w.title}</b>{w.company ? ` · ${w.company}` : ""}{" "}
                  <span className="text-slate-500">({w.start} → {w.isCurrent ? "present" : w.end})</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xl font-semibold">Best-matching jobs</h2>
        {!matches.length && (
          <div className="mt-3"><Notice kind="info">This candidate was not shortlisted for any job, so there are no scores yet.</Notice></div>
        )}
        <ul className="mt-3 space-y-3">
          {matches.map((m) => (
            <li key={m.job_id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link href={`/jobs/${m.job_id}`} className="font-semibold text-indigo-700 hover:underline">{m.title}</Link>
                  <p className="text-xs text-slate-500">Ranked #{m.rank} for this job</p>
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
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Raw CV</h2>
        <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-700">{c.raw_text}</pre>
      </section>
    </div>
  );
}