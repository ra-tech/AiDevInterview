import { cn } from '../../lib/utils.js';

export function MessageBubble({ role, children }) {
  const isInterviewer = role === 'interviewer';
  return (
    <div className={cn('flex', isInterviewer ? 'justify-start' : 'justify-end')}>
      <div className={cn('max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed', isInterviewer ? 'bg-white/[0.06] text-white/90' : 'bg-brand-500 text-white')}>
        {!isInterviewer ? null : <p className="mb-1 text-[10px] uppercase tracking-wide text-white/40">Interviewer</p>}
        {children}
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl bg-white/[0.06] px-4 py-3">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/40" style={{ animationDelay: `${i * 120}ms` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
