import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useParams } from 'react-router-dom';
import { Card, Badge, Button } from '../components/ui/primitives.jsx';
import { ScoreRadar } from '../components/dashboard/ScoreCard.jsx';
import { labelize } from '../lib/utils.js';
import { api } from '../api/client.js';

export default function ReportPage() {
  const { id } = useParams();
  const [interview, setInterview] = useState(null);
  const [notReady, setNotReady] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get(`/api/interviews/${id}/report`)
      .then(setInterview)
      .catch((err) => {
        if (err.status === 404) setNotReady(true);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex min-h-screen items-center justify-center text-white/40">Loading report…</div>;

  if (notReady || !interview) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
        <Card>
          <h1 className="text-lg font-semibold">Report is still being generated</h1>
          <p className="mt-2 text-sm text-white/50">This can take a few moments right after an interview ends. Refresh shortly.</p>
          <Link to="/dashboard"><Button variant="secondary" className="mt-4">Back to Dashboard</Button></Link>
        </Card>
      </main>
    );
  }

  const r = interview.report;

  const radarData = [
    { subject: 'Technical', score: r.technicalKnowledge },
    { subject: 'Problem Solving', score: r.problemSolving },
    { subject: 'Coding', score: r.coding },
    { subject: 'Communication', score: r.communication },
    { subject: 'Depth', score: r.depthOfUnderstanding },
    { subject: 'Role Fit', score: r.roleFit }
  ];

  const evidence = r.evidence;
  const studyPlan = [...r.studyPlan].sort((a, b) => a.priority - b.priority);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between text-sm">
        <Link to="/dashboard" className="flex items-center gap-1.5 text-white/50 hover:text-brand-300">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12l9-9 9 9M5 10v10a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-4h2v4a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V10" />
          </svg>
          Dashboard
        </Link>
        <Link to="/history" className="text-white/50 hover:text-brand-300">Interview History</Link>
      </div>

      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-sm text-white/50">{labelize(interview.targetRole)} · {labelize(interview.experienceLevel)}</p>
          <h1 className="text-2xl font-bold">Interview Report</h1>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-white/40">Overall Score</p>
          <p className="text-4xl font-extrabold text-brand-300">{r.overallScore}<span className="text-lg text-white/40">/100</span></p>
        </div>
      </div>

      <Card className="mb-6">
        <ScoreRadar data={radarData} />
      </Card>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold text-green-400">Strengths</h2>
          <ul className="space-y-2 text-sm text-white/70">{r.strengths.map((s, i) => <li key={i}>• {s}</li>)}</ul>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold text-amber-400">Weaknesses</h2>
          <ul className="space-y-2 text-sm text-white/70">{r.weaknesses.map((s, i) => <li key={i}>• {s}</li>)}</ul>
        </Card>
      </div>

      <Card className="mb-6">
        <h2 className="mb-4 font-semibold">Interview Evidence</h2>
        <div className="space-y-4">
          {evidence.map((e, i) => (
            <div key={i} className="border-b border-white/5 pb-4 last:border-0 last:pb-0">
              <div className="mb-1 flex items-center justify-between">
                <p className="font-medium">{e.topic}</p>
                <Badge>{e.score}/10</Badge>
              </div>
              <p className="text-sm text-white/60">{e.narrative}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mb-6">
        <h2 className="mb-4 font-semibold">Recommended Study Plan</h2>
        <div className="space-y-4">
          {studyPlan.map((p) => (
            <div key={p.priority}>
              <p className="font-medium">Priority {p.priority} — {p.title}</p>
              <p className="mt-1 text-sm text-white/60">{p.why}</p>
              <ul className="mt-2 space-y-1 text-sm text-white/50">{p.practice.map((pr, i) => <li key={i}>• {pr}</li>)}</ul>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 font-semibold">Question-by-Question Review</h2>
        <div className="space-y-6">
          {interview.questions.filter((q) => q.answer?.evaluation).map((q, i) => {
            const ev = q.answer.evaluation;
            return (
              <div key={q.id} className="border-b border-white/5 pb-5 last:border-0">
                <p className="text-xs uppercase tracking-wide text-white/40">Question {i + 1} · {labelize(q.section)}</p>
                <p className="mt-1 font-medium">{q.prompt}</p>
                <p className="mt-2 text-sm text-white/60"><span className="text-white/40">Your answer: </span>{q.answer.content}</p>
                <div className="mt-3 flex flex-wrap gap-4 text-sm">
                  <span className="text-white/50">Technical: {ev.technicalAccuracy}/10</span>
                  <span className="text-white/50">Communication: {ev.communication}/10</span>
                  <span className="text-white/50">Depth: {ev.depthOfUnderstanding}/10</span>
                </div>
                {ev.coveredConcepts.length > 0 && (
                  <p className="mt-2 text-sm"><span className="text-green-400/80">Covered: </span><span className="text-white/60">{ev.coveredConcepts.join(', ')}</span></p>
                )}
                {ev.missedConcepts.length > 0 && (
                  <p className="mt-1 text-sm"><span className="text-amber-400/80">Missed: </span><span className="text-white/60">{ev.missedConcepts.join(', ')}</span></p>
                )}
                <p className="mt-2 text-sm text-white/50">{ev.explanation}</p>
                {ev.suggestedAnswer && (
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer text-brand-300">Suggested improved answer</summary>
                    <p className="mt-1 text-white/60">{ev.suggestedAnswer}</p>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </main>
  );
}
