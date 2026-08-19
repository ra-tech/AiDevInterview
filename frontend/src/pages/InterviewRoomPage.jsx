import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card } from '../components/ui/primitives.jsx';
import { ProgressPanel } from '../components/interview/ProgressPanel.jsx';
import { MessageBubble, TypingIndicator } from '../components/interview/MessageBubble.jsx';
import { labelize } from '../lib/utils.js';
import { api } from '../api/client.js';

export default function InterviewRoomPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [turns, setTurns] = useState([]);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [interviewState, setInterviewState] = useState('CREATED');
  const [sections, setSections] = useState([]);
  const [currentSection, setCurrentSection] = useState(null);
  const [secondsRemaining, setSecondsRemaining] = useState(null);
  const [targetRole, setTargetRole] = useState('');
  const [finishing, setFinishing] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    (async () => {
      let data;
      try {
        data = await api.get(`/api/interviews/${id}`);
      } catch {
        setLoading(false);
        return;
      }

      // Guard against browser back-button (or a stale bookmark) landing back on a finished
      // interview — show the report instead of a half-broken "resume chatting" room.
      if (data.state === 'COMPLETED' || data.state === 'EVALUATED') {
        navigate(`/interviews/${id}/report`, { replace: true });
        return;
      }

      setInterviewState(data.state);
      setTargetRole(labelize(data.targetRole));
      if (data.plan?.sections) setSections(data.plan.sections.map((s) => s.type));

      if (data.durationMinutes) {
        // Base the countdown on the server's recorded startedAt, not "full duration from
        // whenever this page happens to load" — otherwise every refresh resets the clock.
        if (data.startedAt) {
          const elapsedSeconds = Math.floor((Date.now() - new Date(data.startedAt).getTime()) / 1000);
          setSecondsRemaining(Math.max(0, data.durationMinutes * 60 - elapsedSeconds));
        } else {
          setSecondsRemaining(data.durationMinutes * 60);
        }
      }

      const loadedTurns = [];
      for (const q of data.questions ?? []) {
        loadedTurns.push({ role: 'interviewer', content: q.prompt, questionId: q.id });
        if (q.answer) loadedTurns.push({ role: 'candidate', content: q.answer.content });
      }
      setTurns(loadedTurns);
      if (data.questions?.length) setCurrentSection(data.questions.at(-1).section);
      setLoading(false);
    })();
  }, [id, navigate]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns]);

  useEffect(() => {
    if (secondsRemaining === null || interviewState !== 'IN_PROGRESS') return;
    const t = setInterval(() => setSecondsRemaining((s) => (s !== null ? Math.max(0, s - 1) : s)), 1000);
    return () => clearInterval(t);
  }, [secondsRemaining !== null, interviewState]);

  async function handleStart() {
    setStarting(true);
    setError(null);
    try {
      const question = await api.post(`/api/interviews/${id}`);
      setTurns([{ role: 'interviewer', content: question.prompt, questionId: question.id }]);
      setCurrentSection(question.section);
      if (Array.isArray(question.planSections)) {
        setSections(question.planSections.map((s) => s.type));
      }
      setInterviewState('IN_PROGRESS');
    } catch (err) {
      setError(err.message || 'Could not start interview.');
    } finally {
      setStarting(false);
    }
  }

  const currentQuestionId = [...turns].reverse().find((t) => t.role === 'interviewer')?.questionId;
  const alreadyAnswered = turns.at(-1)?.role === 'candidate';

  async function handleSubmit() {
    if (!answer.trim() || !currentQuestionId || submitting || alreadyAnswered) return;
    setSubmitting(true);
    setError(null);

    const submittedText = answer;
    setTurns((t) => [...t, { role: 'candidate', content: submittedText }]);
    setAnswer('');

    try {
      const data = await api.post(`/api/interviews/${id}/answer`, { questionId: currentQuestionId, content: submittedText });
      setTurns((t) => [...t, { role: 'interviewer', content: data.nextQuestion.prompt, questionId: data.nextQuestion.id }]);
      setCurrentSection(data.nextQuestion.section);
    } catch (err) {
      setError(err.message || 'Something went wrong submitting your answer.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFinish() {
    const answeredCount = turns.filter((t) => t.role === 'candidate').length;
    if (answeredCount === 0) {
      const proceed = window.confirm("You haven't answered any questions yet. Ending now will produce a report with no real feedback — end anyway?");
      if (!proceed) return;
    }

    setFinishing(true);
    setError(null);
    try {
      await api.post(`/api/interviews/${id}/report`);
      // The report now exists server-side, so the report page will render it immediately —
      // no manual refresh needed on arrival.
      navigate(`/interviews/${id}/report`);
    } catch (err) {
      setError(err.message || 'Could not generate your report. Please try again.');
      setFinishing(false);
    }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center text-white/40">Loading interview…</div>;

  if (finishing) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
        <Card>
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          <h1 className="text-lg font-semibold">Generating your report…</h1>
          <p className="mt-2 text-sm text-white/50">The interviewer is reviewing your answers and putting together evidence-based feedback. This usually takes a few seconds.</p>
        </Card>
      </main>
    );
  }

  if (interviewState === 'CREATED') {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
        <Card>
          <h1 className="text-xl font-semibold">Ready to begin your {targetRole} interview?</h1>
          <p className="mt-2 text-sm text-white/50">You'll be asked one question at a time. The interviewer adapts based on how you answer, so take your time and be specific.</p>
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          <Button className="mt-6" onClick={handleStart} disabled={starting}>
            {starting ? 'Preparing your interview…' : 'Begin Interview'}
          </Button>
        </Card>
      </main>
    );
  }

  const minutes = secondsRemaining !== null ? Math.floor(secondsRemaining / 60) : null;
  const secs = secondsRemaining !== null ? secondsRemaining % 60 : null;

  return (
    <main className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-[1fr_260px]">
      <div className="flex flex-col">
        <header className="mb-4 flex items-center justify-between border-b border-white/10 pb-4">
          <h1 className="text-lg font-semibold">{targetRole} Interview</h1>
          <div className="flex items-center gap-4">
            {minutes !== null && <span className="text-sm text-white/50">{minutes}:{secs.toString().padStart(2, '0')} remaining</span>}
            {/* Not gated on the plan literally naming a "coding" section — the AI's section
                naming is free-form and unreliable to depend on for a core feature. */}
            <Button variant="secondary" onClick={() => navigate(`/interviews/${id}/coding`)}>Coding Challenge</Button>
            <Button variant="secondary" onClick={handleFinish} disabled={finishing}>
              {finishing ? 'Finishing…' : 'End Interview'}
            </Button>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto py-2" style={{ maxHeight: '60vh' }}>
          {turns.map((t, i) => <MessageBubble key={i} role={t.role}>{t.content}</MessageBubble>)}
          {submitting && <TypingIndicator />}
        </div>

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <div className="mt-4 flex gap-2">
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
            }}
            disabled={submitting || alreadyAnswered}
            placeholder="Type your answer… (Enter to send, Shift+Enter for a new line)"
            rows={3}
            className="flex-1 resize-none rounded-lg border border-white/10 bg-white/5 p-3 text-sm outline-none focus:border-brand-500 disabled:opacity-50"
          />
          <Button onClick={handleSubmit} disabled={submitting || alreadyAnswered || !answer.trim()} className="self-end">
            {submitting ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </div>

      <aside className="lg:pt-2">
        <Card>
          <ProgressPanel
            sections={sections.map((s) => ({
              label: labelize(s),
              status: s === currentSection ? 'active' : sections.indexOf(s) < sections.indexOf(currentSection ?? '') ? 'done' : 'upcoming'
            }))}
          />
        </Card>
      </aside>
    </main>
  );
}
