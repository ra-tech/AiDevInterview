import { Link } from 'react-router-dom';
import { Button, Card } from '../components/ui/primitives.jsx';

const FEATURES = [
  { title: 'Adaptive interviews', body: 'The interviewer changes its next question based on what you actually said — not a fixed script.' },
  { title: 'Real coding challenges', body: 'Solve problems in an embedded editor with hidden and visible test cases, then defend your solution.' },
  { title: 'Job-specific preparation', body: 'Paste a job description and the interview weights questions toward what that role actually needs.' },
  { title: 'Evidence-based feedback', body: 'Every strength and weakness in your report points back to something you said or wrote — no arbitrary scoring.' },
  { title: 'Progress tracking', body: 'See your topic-by-topic scores improve across interviews, with a study plan built from your real gaps.' }
];

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-6xl px-6">
      <nav className="flex items-center justify-between py-6">
        <span className="text-lg font-semibold tracking-tight">
          DevInterview<span className="text-brand-300">AI</span>
        </span>
        <div className="flex gap-3">
          <Link to="/login"><Button variant="ghost">Log in</Button></Link>
          <Link to="/signup"><Button>Sign up</Button></Link>
        </div>
      </nav>

      <section className="py-20 text-center">
        <h1 className="mx-auto max-w-3xl text-5xl font-extrabold leading-tight tracking-tight">Practice interviews that actually adapt to you.</h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-white/60">AI-powered technical interviews built around your role, skills, and target job.</p>
        <Link to="/signup">
          <Button className="mt-8 px-6 py-3 text-base">Start an Interview</Button>
        </Link>
      </section>

      <section className="grid grid-cols-1 gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <Card key={f.title}>
            <h3 className="font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-white/60">{f.body}</p>
          </Card>
        ))}
      </section>
    </main>
  );
}
