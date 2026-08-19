import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card } from '../components/ui/primitives.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch {
      setError('Invalid email or password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Card>
        <h1 className="text-xl font-semibold">Log in</h1>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <input className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-brand-500" placeholder="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-brand-500" placeholder="Password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
      </Card>
    </main>
  );
}
