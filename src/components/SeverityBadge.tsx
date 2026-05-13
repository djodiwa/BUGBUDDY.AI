import { Severity } from '@/types/scanner';
import { cn } from '@/lib/utils';

const severityConfig: Record<Severity, { label: string; className: string; glow: string }> = {
  info: { label: 'INFO', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20', glow: 'shadow-[0_0_8px_rgba(59,130,246,0.2)]' },
  low: { label: 'LOW', className: 'bg-green-500/10 text-green-400 border-green-500/20', glow: 'shadow-[0_0_8px_rgba(34,197,94,0.2)]' },
  medium: { label: 'MEDIUM', className: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', glow: 'shadow-[0_0_8px_rgba(234,179,8,0.2)]' },
  high: { label: 'HIGH', className: 'bg-orange-500/10 text-orange-400 border-orange-500/20', glow: 'shadow-[0_0_8px_rgba(249,115,22,0.2)]' },
  critical: { label: 'CRITICAL', className: 'bg-red-500/10 text-red-400 border-red-500/20', glow: 'shadow-[0_0_8px_rgba(239,68,68,0.2)]' },
};

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const config = severityConfig[severity] || severityConfig.info;
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-md font-mono text-[9px] font-bold border uppercase tracking-[0.1em] backdrop-blur-sm transition-all',
      config.className,
      config.glow,
      className
    )}>
      {config.label}
    </span>
  );
}
