import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card } from '../components/ui/primitives.jsx';
import { DemoInterviewButton } from '../components/interview/DemoInterviewButton.jsx';
import { ScoreTrend } from '../components/dashboard/ScoreTrend.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';
import { labelize } from '../lib/utils.js';

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/api/interviews/meta/dashboard')
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex min-h-screen items-center justify-center text-white/40">Loading dashboard…</div>;

  const { interviews, allScoredInterviews, skillScores } = data;

  const scored = interviews.filter((i) => i.report);
  const avgScore = scored.length ? Math.round(scored.reduce((s, i) => s + i.report.overallScore, 0) / scored.length) : null;

  const trendData = allScoredInterviews.map((i, idx) => ({ label: `#${idx + 1}`, score: i.report.overallScore }));

  const byTopic = new Map();
  for (const s of skillScores) byTopic.set(s.topic, [...(byTopic.get(s.topic) ?? []), s.score]);
  const topicAverages = [...byTopic.entries()]
    .map(([topic, scores]) => ({ topic, avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) }))
    .sort((a, b) => b.avg - a.avg);

  const strongest = topicAverages[0];
  const weakest = topicAverages.at(-1);

  const readiness =
    allScoredInterviews.length < 3
      ? null
      : avgScore >= 75
        ? { label: 'Interview-ready', tone: 'text-green-400' }
        : avgScore >= 55
          ? { label: 'Getting there', tone: 'text-amber-400' }
          : { label: 'Needs more practice', tone: 'text-red-400' };

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Welcome back{user?.name ? `, ${user.name}` : ''}</h1>
          <p className="mt-1 text-sm text-white/50">Here's how your interview prep is going.</p>
        </div>
        <div className="flex items-start gap-2">
          <DemoInterviewButton />
          <Link to="/interviews/new"><Button>Start New Interview</Button></Link>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card>
          <p className="text-sm text-white/50">Average Score</p>
          <p className="mt-2 text-3xl font-bold">
            {avgScore ?? '—'}
            {avgScore !== null && <span className="text-lg text-white/40">/100</span>}
          </p>
        </Card>
        <Card><p className="text-sm text-white/50">Current Strength</p><p className="mt-2 text-xl font-semibold">{strongest ? `${strongest.topic} (${strongest.avg}%)` : '—'}</p></Card>
        <Card><p className="text-sm text-white/50">Improvement Area</p><p className="mt-2 text-xl font-semibold">{weakest ? `${weakest.topic} (${weakest.avg}%)` : '—'}</p></Card>
        <Card>
          <p className="text-sm text-white/50">Role Readiness</p>
          <p className={`mt-2 text-xl font-semibold ${readiness?.tone ?? 'text-white/40'}`}>{readiness?.label ?? 'Not enough data yet'}</p>
        </Card>
      </div>

      {trendData.length >= 2 && (
        <Card className="mt-4">
          <p className="text-sm text-white/50 mb-3">Score Trend</p>
          <ScoreTrend data={trendData} />
        </Card>
      )}

      {topicAverages.length > 0 && (
        <Card className="mt-4">
          <p className="text-sm text-white/50 mb-3">Topic-wise performance</p>
          <div className="space-y-2">
            {topicAverages.map((t) => (
              <div key={t.topic} className="flex items-center gap-3 text-sm">
                <span className="w-40 truncate text-white/70">{t.topic}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${t.avg}%` }} />
                </div>
                <span className="w-10 text-right text-white/50">{t.avg}%</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="mt-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-white/50">Recent Interviews</p>
          <Link to="/history" className="text-xs text-brand-300 hover:underline">View all</Link>
        </div>
        {interviews.length === 0 ? (
          <p className="text-sm text-white/40">No interviews yet — start your first one above.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {interviews.map((i) => (
              <Link key={i.id} to={i.report ? `/interviews/${i.id}/report` : `/interviews/${i.id}/room`} className="flex items-center justify-between py-3 text-sm hover:text-brand-300">
                <span>{labelize(i.targetRole)} · {labelize(i.experienceLevel)}</span>
                <span className="text-white/40">{i.report ? `${i.report.overallScore}/100` : labelize(i.state)}</span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </main>
  );
}
