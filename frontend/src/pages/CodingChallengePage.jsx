import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Badge } from '../components/ui/primitives.jsx';
import { api } from '../api/client.js';

export default function CodingChallengePage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [challenge, setChallenge] = useState(null);
  const [language, setLanguage] = useState('javascript');
  const [code, setCode] = useState('');
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.post(`/api/interviews/${id}/coding`);
        setChallenge(data);
        const langs = Object.keys(data.starterCode);
        const lang = langs[0] ?? 'javascript';
        setLanguage(lang);
        setCode(data.starterCode[lang] ?? '');
      } catch (err) {
        setError(err.message || 'Could not load a coding challenge.');
      }
    })();
  }, [id]);

  function handleLanguageChange(lang) {
    setLanguage(lang);
    setCode(challenge?.starterCode[lang] ?? '');
  }

  async function handleRun() {
    if (!challenge || running || submitted) return;
    setRunning(true);
    setError(null);
    try {
      const result = await api.post(`/api/interviews/${id}/coding/${challenge.challengeId}/run`, { language, code });
      setRunResult(result);
    } catch (err) {
      setError(err.message || 'Could not run code.');
    } finally {
      setRunning(false);
    }
  }

  async function handleSubmit() {
    if (!challenge || submitting || submitted) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/api/interviews/${id}/coding/${challenge.challengeId}/submit`, { language, code });
      setSubmitted(true);
      navigate(`/interviews/${id}/room`);
    } catch (err) {
      setError(err.message || 'Could not submit solution.');
      setSubmitting(false);
    }
  }

  if (error && !challenge) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
        <Card><p className="text-sm text-red-400">{error}</p></Card>
      </main>
    );
  }

  if (!challenge) {
    return <div className="flex min-h-screen items-center justify-center text-white/40">Preparing your coding challenge…</div>;
  }

  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <div className="border-r border-white/10 p-6 overflow-y-auto" style={{ maxHeight: '100vh' }}>
        <h1 className="text-xl font-semibold">{challenge.title}</h1>
        <p className="mt-4 whitespace-pre-wrap text-sm text-white/70">{challenge.statement}</p>

        {challenge.constraints && (
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide text-white/40">Constraints</p>
            <p className="mt-1 text-sm text-white/60">{challenge.constraints}</p>
          </div>
        )}

        <div className="mt-4 space-y-3">
          {challenge.examples.map((ex, i) => (
            <Card key={i} className="p-4">
              <p className="text-xs text-white/40">Example {i + 1}</p>
              <p className="mt-1 font-mono text-sm">Input: {ex.input}</p>
              <p className="font-mono text-sm">Output: {ex.output}</p>
              {ex.explanation && <p className="mt-1 text-sm text-white/50">{ex.explanation}</p>}
            </Card>
          ))}
        </div>
      </div>

      <div className="flex flex-col">
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <div className="flex gap-2">
            {Object.keys(challenge.starterCode).map((lang) => (
              <button key={lang} onClick={() => handleLanguageChange(lang)} className={`rounded-md px-2.5 py-1 text-xs ${language === lang ? 'bg-brand-500 text-white' : 'bg-white/5 text-white/60'}`}>
                {lang}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleRun} disabled={running || submitted}>
              {running ? 'Running…' : 'Run Code'}
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || submitted}>
              {submitting ? 'Submitting…' : 'Submit Solution'}
            </Button>
          </div>
        </div>

        <div className="flex-1">
          <Editor
            height="55vh"
            theme="vs-dark"
            language={language === 'cpp' ? 'cpp' : language}
            value={code}
            onChange={(v) => setCode(v ?? '')}
            options={{ fontSize: 14, minimap: { enabled: false }, readOnly: submitted }}
          />
        </div>

        <div className="border-t border-white/10 p-4" style={{ maxHeight: '25vh', overflowY: 'auto' }}>
          <p className="mb-2 text-xs uppercase tracking-wide text-white/40">Console</p>
          {error && <p className="text-sm text-red-400">{error}</p>}
          {runResult && (
            <div className="space-y-2">
              <p className="text-sm">
                <Badge className={runResult.passedCount === runResult.totalCount ? 'text-green-400' : 'text-amber-400'}>
                  {runResult.passedCount}/{runResult.totalCount} visible tests passed
                </Badge>
              </p>
              {runResult.results.map((r, i) => (
                <div key={i} className="rounded-md bg-white/5 p-2 text-xs font-mono">
                  <span className={r.passed ? 'text-green-400' : 'text-red-400'}>{r.passed ? '✓' : '✗'}</span>{' '}
                  input: {r.input} → expected: {r.expectedOutput}, got: {r.actualOutput}
                </div>
              ))}
            </div>
          )}
          {!runResult && !error && <p className="text-sm text-white/30">Run your code to see visible test results here.</p>}
        </div>
      </div>
    </main>
  );
}
