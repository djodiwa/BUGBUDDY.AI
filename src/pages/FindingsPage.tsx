import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppNavbar } from '@/components/AppNavbar';
import { SeverityBadge } from '@/components/SeverityBadge';
import { useAuth } from '@/contexts/AuthContext';
import { RefreshCw, Filter, Activity, Shield, ChevronRight, X, Terminal, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Finding {
  id: string;
  scan_id: string;
  tool: string;
  title: string;
  description: string;
  severity: string;
  cvss: number | null;
  confidence: string;
  url: string;
  evidence: string[];
  timestamp: string;
}

const toolColors: Record<string, string> = {
  nuclei: 'text-purple-400 border-purple-500/20 bg-purple-500/5',
  nikto: 'text-blue-400 border-blue-500/20 bg-blue-500/5',
  wapiti: 'text-yellow-400 border-yellow-500/20 bg-yellow-500/5',
  zap: 'text-orange-400 border-orange-500/20 bg-orange-500/5',
  nmap: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5',
  sslyze: 'text-cyan-400 border-cyan-500/20 bg-cyan-500/5',
};

export default function FindingsPage() {
  const { token } = useAuth();
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [toolFlt, setToolFlt] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Finding | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/findings', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (r.ok) {
        const data: Finding[] = await r.json();
        const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
        setFindings(data.sort((a, b) => (order[a.severity] ?? 5) - (order[b.severity] ?? 5)));
      }
    } catch (err) {
      console.error("Failed to load findings", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const tools = ['all', ...Array.from(new Set(findings.map(f => f.tool)))];
  
  const filtered = findings.filter(f => {
    const matchesSev = filter === 'all' || f.severity === filter;
    const matchesTool = toolFlt === 'all' || f.tool === toolFlt;
    const matchesSearch = !search || 
      f.title.toLowerCase().includes(search.toLowerCase()) || 
      f.url.toLowerCase().includes(search.toLowerCase()) ||
      f.description.toLowerCase().includes(search.toLowerCase());
    return matchesSev && matchesTool && matchesSearch;
  });

  const counts = findings.reduce((a, f) => ({ ...a, [f.severity]: (a[f.severity] || 0) + 1 }), {} as Record<string, number>);

  return (
    <div className="min-h-screen bg-[#050508] grid-bg-animated relative overflow-hidden">
      <AppNavbar />
      
      {/* Background Decor */}
      <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[140px] pointer-events-none" />

      <main className="max-w-7xl mx-auto px-6 pt-32 pb-12 space-y-8 relative z-10">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-1">
            <h1 className="text-3xl font-mono font-bold tracking-tighter text-foreground flex items-center gap-3">
              <span className="text-primary">&gt;</span> INTELLIGENCE_FEED
            </h1>
            <p className="text-sm font-mono text-muted-foreground/60">
              Aggregated vulnerability findings from all active scan engines.
            </p>
          </motion.div>
          
          <div className="flex items-center gap-4">
            <div className="px-4 py-2 glass rounded-xl border border-white/5 flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest">
                {findings.length} TOTAL_THREATS
              </span>
            </div>
            <button onClick={load} disabled={loading}
              className="p-2.5 glass rounded-xl hover:text-primary transition-all group border border-white/5 active:scale-95">
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Severity Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {(['critical', 'high', 'medium', 'low', 'info'] as const).map((s, i) => (
            <motion.div key={s} 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ delay: i * 0.05 }}
              className="glass-card rounded-2xl p-4 flex flex-col gap-2 group hover:border-primary/20 transition-all cursor-default"
            >
              <div className="flex items-center justify-between">
                <SeverityBadge severity={s} />
                <span className="text-[10px] font-mono text-muted-foreground/40 font-bold">
                  {findings.length > 0 ? ((counts[s] || 0) / findings.length * 100).toFixed(0) : 0}%
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-mono font-bold text-foreground">{counts[s] || 0}</span>
                <span className="text-[10px] font-mono text-muted-foreground uppercase">active</span>
              </div>
              <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden mt-1">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${findings.length > 0 ? ((counts[s] || 0) / findings.length * 100) : 0}%` }}
                  className={cn("h-full transition-all duration-1000", 
                    s === 'critical' ? 'bg-rose-600' : s === 'high' ? 'bg-orange-500' : s === 'medium' ? 'bg-amber-400' : s === 'low' ? 'bg-emerald-400' : 'bg-blue-400'
                  )} 
                />
              </div>
            </motion.div>
          ))}
        </div>

        {/* Filters & Search */}
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row items-center gap-4 p-2 glass-strong rounded-[20px] border border-white/5">
            <div className="flex items-center gap-3 px-4 py-2 border-r border-white/5 w-full lg:w-auto">
              <Filter className="w-4 h-4 text-primary" />
              <span className="text-[10px] font-mono font-bold text-muted-foreground tracking-widest uppercase">FILTERS</span>
            </div>
            
            <div className="flex gap-2 p-1 overflow-x-auto no-scrollbar w-full flex-1">
              {['all', 'critical', 'high', 'medium', 'low', 'info'].map(s => (
                <button key={s} onClick={() => setFilter(s)}
                  className={cn(
                    "text-[10px] font-mono font-bold px-4 py-2 rounded-xl transition-all uppercase tracking-wider whitespace-nowrap",
                    filter === s ? "bg-primary text-black shadow-[0_0_15px_rgba(var(--primary),0.3)]" : "text-muted-foreground hover:bg-white/5"
                  )}>
                  {s}
                </button>
              ))}
              <div className="w-px h-6 bg-white/5 mx-2 self-center shrink-0" />
              {tools.map(t => (
                <button key={t} onClick={() => setToolFlt(t)}
                  className={cn(
                    "text-[10px] font-mono font-bold px-4 py-2 rounded-xl transition-all uppercase tracking-wider whitespace-nowrap",
                    toolFlt === t ? "bg-white/10 text-primary border border-primary/20" : "text-muted-foreground hover:bg-white/5"
                  )}>
                  {t}
                </button>
              ))}
            </div>

            <div className="w-full lg:w-64 relative group px-2 lg:px-0 lg:pr-2">
              <Search className="absolute left-5 lg:left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40 group-focus-within:text-primary transition-colors" />
              <input 
                type="text" 
                placeholder="SEARCH_THREATS..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-black/40 border border-white/5 rounded-xl pl-10 pr-4 py-2 text-[10px] font-mono text-foreground placeholder:text-muted-foreground/20 focus:outline-none focus:border-primary/30 focus:bg-black/60 transition-all"
              />
            </div>
          </div>
        </div>

        {/* Findings List */}
        {loading ? (
          <div className="glass-card rounded-[24px] p-24 text-center border border-white/5">
            <Activity className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
            <p className="text-xs font-mono text-muted-foreground tracking-widest uppercase">Synchronizing intelligence database...</p>
          </div>
        ) : filtered.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card rounded-[24px] p-24 text-center border border-white/5 border-dashed">
            <Shield className="w-10 h-10 text-muted-foreground/20 mx-auto mb-4" />
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
              {findings.length === 0 ? 'PERIMETER_CLEAR. NO THREATS DETECTED.' : 'NO FINDINGS MATCHING CURRENT FILTERS.'}
            </p>
          </motion.div>
        ) : (
          <div className="grid gap-3">
            <AnimatePresence mode="popLayout">
              {filtered.map((f, i) => (
                <motion.div key={f.id} 
                  initial={{ opacity: 0, y: 10 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ delay: Math.min(i * 0.03, 0.5) }}
                  onClick={() => setSelected(f)}
                  className="glass-card rounded-2xl p-5 flex items-center justify-between cursor-pointer border border-white/5 hover:border-primary/30 group transition-all duration-300"
                >
                  
                  <div className="flex items-center gap-6 min-w-0 flex-1">
                    <div className="flex-shrink-0 w-24">
                      <SeverityBadge severity={f.severity as any} />
                    </div>
                    <div className="min-w-0 space-y-1.5 flex-1">
                      <div className="flex items-center gap-3">
                        <span className={cn("text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase tracking-tighter shrink-0", toolColors[f.tool] || 'text-muted-foreground border-white/10 bg-white/5')}>
                          {f.tool}
                        </span>
                        <h3 className="font-mono text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">{f.title}</h3>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground/60">
                        <span className="truncate max-w-[200px] md:max-w-[400px]">{f.url}</span>
                        <span className="w-1 h-1 rounded-full bg-white/10 shrink-0" />
                        <span className="shrink-0 opacity-40">ID: {f.scan_id?.slice(0, 8)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 ml-4">
                    {f.cvss != null && (
                      <div className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/5 font-mono text-[11px] font-bold text-foreground/80 hidden sm:block">
                        CVSS {f.cvss.toFixed(1)}
                      </div>
                    )}
                    <div className="p-2.5 rounded-xl glass group-hover:bg-primary group-hover:text-black transition-all">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Modal Detail Overlay */}
        <AnimatePresence>
          {selected && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setSelected(null)}>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-[#050508]/90 backdrop-blur-md" />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }} 
                animate={{ opacity: 1, scale: 1, y: 0 }} 
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="glass-strong rounded-[32px] p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto relative z-10 border border-white/10 shadow-2xl no-scrollbar" 
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-start justify-between mb-8">
                  <div className="space-y-4 flex-1 pr-8">
                    <div className="flex items-center gap-4">
                      <SeverityBadge severity={selected.severity as any} />
                      <span className={cn("px-3 py-1 rounded-lg border font-mono text-[10px] font-bold uppercase", toolColors[selected.tool])}>
                        {selected.tool}_ENGINE
                      </span>
                      {selected.cvss != null && (
                        <span className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 font-mono text-[10px] font-bold text-foreground">
                          CVSS_SCORE: {selected.cvss.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <h2 className="text-2xl md:text-3xl font-mono font-bold text-foreground leading-tight tracking-tighter uppercase underline decoration-primary/20 underline-offset-8">
                      {selected.title}
                    </h2>
                  </div>
                  <button onClick={() => setSelected(null)} className="p-2.5 glass rounded-2xl hover:bg-rose-500/10 hover:text-rose-500 transition-all border border-white/5">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid md:grid-cols-3 gap-8 mb-8">
                  <div className="md:col-span-2 space-y-6">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-primary/60">
                        <Activity className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-mono font-bold tracking-widest uppercase">VULNERABILITY_DESCRIPTION</span>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed font-mono bg-white/[0.02] p-6 rounded-2xl border border-white/5">
                        {selected.description || 'No detailed description available for this finding.'}
                      </p>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-primary/60">
                        <Search className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-mono font-bold tracking-widest uppercase">TARGET_VECTOR</span>
                      </div>
                      <div className="glass-card rounded-xl p-4 font-mono text-[11px] text-primary/90 break-all border-primary/20 bg-primary/5">
                        {selected.url}
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="glass-card rounded-2xl p-5 space-y-2 border-white/10">
                      <span className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-widest">THREAT_METRICS</span>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-mono text-muted-foreground">CONFIDENCE</span>
                          <span className="text-[10px] font-mono font-bold text-foreground uppercase px-2 py-0.5 bg-white/5 rounded">{selected.confidence || 'MEDIUM'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-mono text-muted-foreground">TIMESTAMP</span>
                          <span className="text-[10px] font-mono text-foreground uppercase">
                            {new Date(selected.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-mono text-muted-foreground">ENGINE</span>
                          <span className="text-[10px] font-mono text-foreground uppercase">{selected.tool}</span>
                        </div>
                      </div>
                    </div>

                    <div className="glass-card rounded-2xl p-5 space-y-2 border-white/10">
                      <span className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-widest">SYSTEM_IDENTIFIER</span>
                      <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                        <p className="text-[9px] font-mono text-muted-foreground/40 break-all leading-relaxed uppercase">
                          UUID: {selected.id}<br/>
                          SCAN: {selected.scan_id}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {selected.evidence?.filter(Boolean).length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-primary">
                      <Terminal className="w-4 h-4" />
                      <span className="text-[10px] font-mono font-bold tracking-widest uppercase">RAW_EVIDENCE_LOG</span>
                    </div>
                    <div className="relative group">
                      <div className="absolute -inset-1 bg-primary/20 rounded-[24px] blur-xl opacity-0 group-hover:opacity-10 transition-opacity duration-500" />
                      <pre className="relative font-mono text-[11px] text-primary/70 bg-black/80 rounded-[20px] p-8 border border-white/10 whitespace-pre-wrap overflow-x-hidden shadow-inner max-h-[300px] overflow-y-auto custom-scrollbar">
                        <code>{selected.evidence.filter(Boolean).join('\n')}</code>
                      </pre>
                    </div>
                  </div>
                )}

                <div className="mt-12 flex gap-4">
                  <button 
                    onClick={() => setSelected(null)} 
                    className="flex-1 py-4 bg-primary text-black rounded-2xl font-mono font-bold text-xs uppercase tracking-widest hover:brightness-110 transition-all shadow-[0_0_20px_rgba(var(--primary),0.2)]"
                  >
                    CLOSE_DOSSIER
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
