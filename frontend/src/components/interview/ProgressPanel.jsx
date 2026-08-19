import { cn } from '../../lib/utils.js';

export function ProgressPanel({ sections }) {
  return (
    <div>
      <p className="mb-3 text-xs uppercase tracking-wide text-white/40">Interview Progress</p>
      <ul className="space-y-2.5">
        {sections.map((s) => (
          <li key={s.label} className="flex items-center gap-2.5 text-sm">
            <span
              className={cn(
                'flex h-4 w-4 items-center justify-center rounded-full text-[10px]',
                s.status === 'done' && 'bg-brand-500 text-white',
                s.status === 'active' && 'border-2 border-brand-400',
                s.status === 'upcoming' && 'border border-white/20'
              )}
            >
              {s.status === 'done' ? '✓' : ''}
            </span>
            <span className={cn(s.status === 'upcoming' ? 'text-white/35' : s.status === 'active' ? 'text-white' : 'text-white/60')}>{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
