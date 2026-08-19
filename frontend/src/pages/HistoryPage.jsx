import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, Card } from '../components/ui/primitives.jsx';
import { DeleteInterviewButton } from '../components/interview/DeleteInterviewButton.jsx';
import { api } from '../api/client.js';
import { labelize } from '../lib/utils.js';

export default function HistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [allInterviews, setAllInterviews] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/api/interviews')
      .then(setAllInterviews)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex min-h-screen items-center justify-center text-white/40">Loading history…</div>;

  const roleFilter = searchParams.get('role');
  const stateFilter = searchParams.get('state');

  const roles = [...new Set(allInterviews.map((i) => i.targetRole))];
  const states = [...new Set(allInterviews.map((i) => i.state))];

  const interviews = allInterviews.filter((i) => (!roleFilter || i.targetRole === roleFilter) && (!stateFilter || i.state === stateFilter));

  function setFilter(key, value) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key); // this is the fix from the Next.js version's original bug — deletion is explicit, not ambiguous
    setSearchParams(next);
  }

  function handleDeleted(id) {
    setAllInterviews((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Interview History</h1>
        <Link to="/dashboard" className="text-sm text-brand-300 hover:underline">Back to dashboard</Link>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <button onClick={() => setFilter('role', null)} className={`rounded-full border px-3 py-1 text-xs ${!roleFilter ? 'border-brand-500 bg-brand-500/10 text-brand-100' : 'border-white/10 text-white/60'}`}>
          All roles
        </button>
        {roles.map((r) => (
          <button key={r} onClick={() => setFilter('role', r)} className={`rounded-full border px-3 py-1 text-xs ${roleFilter === r ? 'border-brand-500 bg-brand-500/10 text-brand-100' : 'border-white/10 text-white/60'}`}>
            {labelize(r)}
          </button>
        ))}
        <span className="mx-1 text-white/20">|</span>
        <button onClick={() => setFilter('state', null)} className={`rounded-full border px-3 py-1 text-xs ${!stateFilter ? 'border-brand-500 bg-brand-500/10 text-brand-100' : 'border-white/10 text-white/60'}`}>
          Any status
        </button>
        {states.map((s) => (
          <button key={s} onClick={() => setFilter('state', s)} className={`rounded-full border px-3 py-1 text-xs ${stateFilter === s ? 'border-brand-500 bg-brand-500/10 text-brand-100' : 'border-white/10 text-white/60'}`}>
            {labelize(s)}
          </button>
        ))}
      </div>

      {interviews.length === 0 ? (
        <Card><p className="text-sm text-white/40">No interviews match this filter.</p></Card>
      ) : (
        <div className="space-y-3">
          {interviews.map((i) => (
            <Link key={i.id} to={i.report ? `/interviews/${i.id}/report` : `/interviews/${i.id}/room`}>
              <Card className="transition-colors hover:border-brand-500/50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{labelize(i.targetRole)}</p>
                    <p className="mt-1 text-xs text-white/40">
                      {labelize(i.experienceLevel)} · {i.durationMinutes} min
                      {i.jobDescription ? ' · JD-tailored' : ''} · {new Date(i.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {i.skills.slice(0, 3).map((s) => <Badge key={s}>{s}</Badge>)}
                    {i.report ? <span className="text-lg font-semibold text-brand-300">{i.report.overallScore}/100</span> : <Badge>{labelize(i.state)}</Badge>}
                    <DeleteInterviewButton interviewId={i.id} onDeleted={handleDeleted} />
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
