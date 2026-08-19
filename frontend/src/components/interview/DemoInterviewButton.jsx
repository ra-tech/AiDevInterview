import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/primitives.jsx';
import { api } from '../../api/client.js';

export function DemoInterviewButton() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const { id } = await api.post('/api/interviews/demo');
      navigate(`/interviews/${id}/room`);
    } catch (err) {
      setError(err.message || 'Could not start the demo interview.');
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" onClick={handleClick} disabled={loading}>
        {loading ? 'Starting demo…' : 'Try a Demo Interview'}
      </Button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
