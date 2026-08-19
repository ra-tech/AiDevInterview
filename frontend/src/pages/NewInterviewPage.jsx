import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Badge } from '../components/ui/primitives.jsx';
import { UploadOrPasteField } from '../components/interview/UploadOrPasteField.jsx';
import { DurationValues, ExperienceLevelValues, TargetRoleValues } from '../lib/constants.js';
import { labelize } from '../lib/utils.js';
import { api } from '../api/client.js';

const SKILLS = [
  'JavaScript', 'TypeScript', 'React', 'Next.js', 'Node.js', 'Python', 'Java', 'C++',
  'SQL', 'REST APIs', 'Operating Systems', 'DBMS', 'Computer Networks',
  'Data Structures and Algorithms', 'System Design'
];

const STEPS = ['Role', 'Experience', 'Skills', 'Job Description & Resume', 'Duration', 'Review'];

export default function NewInterviewPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [targetRole, setTargetRole] = useState('FULL_STACK_DEVELOPER');
  const [experienceLevel, setExperienceLevel] = useState('ENTRY_LEVEL');
  const [skills, setSkills] = useState([]);
  const [jd, setJd] = useState('');
  const [resume, setResume] = useState('');
  const [duration, setDuration] = useState(30);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleSkill(skill) {
    setSkills((s) => (s.includes(skill) ? s.filter((x) => x !== skill) : [...s, skill]));
  }

  async function startInterview() {
    setSubmitting(true);
    setError(null);
    try {
      const interview = await api.post('/api/interviews', {
        targetRole,
        experienceLevel,
        skills,
        durationMinutes: duration,
        jobDescriptionText: jd.trim() || undefined,
        resumeText: resume.trim() || undefined
      });
      navigate(`/interviews/${interview.id}/room`);
    } catch (err) {
      setError(err.message || 'Could not create interview.');
      setSubmitting(false);
    }
  }

  const canAdvance = [true, true, skills.length > 0, true, true, true][step];

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-6 flex gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-brand-500' : 'bg-white/10'}`} />
        ))}
      </div>
      <p className="mb-2 text-xs uppercase tracking-wide text-white/40">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>

      <Card>
        {step === 0 && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {TargetRoleValues.map((r) => (
              <button key={r} onClick={() => setTargetRole(r)} className={`rounded-lg border px-4 py-3 text-left text-sm transition-colors ${targetRole === r ? 'border-brand-500 bg-brand-500/10' : 'border-white/10 hover:bg-white/5'}`}>
                {labelize(r)}
              </button>
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="grid grid-cols-1 gap-2">
            {ExperienceLevelValues.map((e) => (
              <button key={e} onClick={() => setExperienceLevel(e)} className={`rounded-lg border px-4 py-3 text-left text-sm transition-colors ${experienceLevel === e ? 'border-brand-500 bg-brand-500/10' : 'border-white/10 hover:bg-white/5'}`}>
                {labelize(e)}
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-wrap gap-2">
            {SKILLS.map((s) => (
              <button key={s} onClick={() => toggleSkill(s)} className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${skills.includes(s) ? 'border-brand-500 bg-brand-500/10 text-brand-100' : 'border-white/10 text-white/70 hover:bg-white/5'}`}>
                {s}
              </button>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <p className="mb-2 text-sm font-medium">Job Description <span className="font-normal text-white/40">(optional)</span></p>
              <UploadOrPasteField value={jd} onChange={setJd} rows={7} placeholder="Paste a job description here — the interviewer will weight questions toward what this role actually needs." />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Resume <span className="font-normal text-white/40">(optional)</span></p>
              <UploadOrPasteField value={resume} onChange={setResume} rows={7} placeholder="Paste your resume here — lets the interviewer ask about specific projects and experience you've actually listed, instead of generic questions." />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="grid grid-cols-4 gap-2">
            {DurationValues.map((d) => (
              <button key={d} onClick={() => setDuration(d)} className={`rounded-lg border py-4 text-center text-sm transition-colors ${duration === d ? 'border-brand-500 bg-brand-500/10' : 'border-white/10 hover:bg-white/5'}`}>
                {d} min
              </button>
            ))}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3 text-sm">
            <p><span className="text-white/50">Role:</span> {labelize(targetRole)}</p>
            <p><span className="text-white/50">Experience:</span> {labelize(experienceLevel)}</p>
            <div className="flex flex-wrap gap-1.5">{skills.map((s) => <Badge key={s}>{s}</Badge>)}</div>
            <p><span className="text-white/50">Job description:</span> {jd.trim() ? `${jd.trim().length} characters provided` : 'None'}</p>
            <p><span className="text-white/50">Resume:</span> {resume.trim() ? `${resume.trim().length} characters provided` : 'None'}</p>
            <p><span className="text-white/50">Duration:</span> {duration} minutes</p>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        <div className="mt-6 flex justify-between">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canAdvance}>Next</Button>
          ) : (
            <Button onClick={startInterview} disabled={submitting}>
              {submitting ? 'Starting…' : 'Start Interview'}
            </Button>
          )}
        </div>
      </Card>
    </main>
  );
}
