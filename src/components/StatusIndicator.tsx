import { ScanStatus } from '@/types/scanner';
import { cn } from '@/lib/utils';

const statusConfig: Record<ScanStatus, { label: string; dotClass: string; textClass: string; bgClass: string }> = {
  pending: { label: 'PENDING', dotClass: 'bg-white/20', textClass: 'text-white/40', bgClass: 'bg-white/5 border-white/10' },
  running: { label: 'RUNNING', dotClass: 'bg-neon-cyan animate-pulse', textClass: 'text-neon-cyan', bgClass: 'bg-neon-cyan/10 border-neon-cyan/20' },
  completed: { label: 'COMPLETED', dotClass: 'bg-neon-green', textClass: 'text-neon-green', bgClass: 'bg-neon-green/10 border-neon-green/20' },
  failed: { label: 'FAILED', dotClass: 'bg-red-500', textClass: 'text-red-400', bgClass: 'bg-red-500/10 border-red-500/20' },
  cancelled: { label: 'ABORTED', dotClass: 'bg-white/10', textClass: 'text-white/20', bgClass: 'bg-white/5 border-white/5' },
};

export function StatusIndicator({ status, className }: { status: ScanStatus; className?: string }) {
  const config = statusConfig[status] || statusConfig.pending;
  return (
    <div className={cn(
      'inline-flex items-center gap-2 px-3 py-1 rounded-full border backdrop-blur-md transition-all',
      config.bgClass,
      className
    )}>
      <span className={cn('w-1.5 h-1.5 rounded-full', config.dotClass, status === 'running' && 'shadow-[0_0_8px_rgba(0,230,230,0.8)]')} />
      <span className={cn('font-mono text-[10px] font-bold tracking-widest', config.textClass)}>
        {config.label}
      </span>
    </div>
  );
}
