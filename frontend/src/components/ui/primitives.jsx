import { cn } from '../../lib/utils.js';

export function Button({ className, variant = 'primary', ...props }) {
  const base = 'inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-brand-500 text-white hover:bg-brand-600',
    secondary: 'bg-white/5 text-white border border-white/10 hover:bg-white/10',
    ghost: 'text-white/70 hover:text-white hover:bg-white/5'
  };
  return <button className={cn(base, variants[variant], className)} {...props} />;
}

export function Card({ className, ...props }) {
  return <div className={cn('rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6', className)} {...props} />;
}

export function Badge({ className, ...props }) {
  return (
    <span
      className={cn('inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/70', className)}
      {...props}
    />
  );
}

export function ProgressBar({ value, className }) {
  return (
    <div className={cn('h-2 w-full rounded-full bg-white/10 overflow-hidden', className)}>
      <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-300 transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
