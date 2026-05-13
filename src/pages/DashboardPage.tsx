import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppNavbar } from '@/components/AppNavbar';
import { StatusIndicator } from '@/components/StatusIndicator';
import { useAuth } from '@/contexts/AuthContext';
import { ScanJob } from '@/types/scanner';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Activity, AlertTriangle, Shield, Target, ChevronRight, Clock, Cpu, Zap, RefreshCw, Trash2, Bug, Brain, Skull, Shield as ShieldIcon } from 'lucide-react';

type ScanMode = 'basic'|'medium'|'advanced';
type Sensitivity = 'low-noise'|'normal'|'aggressive';

const MODE_INFO: Record<ScanMode,{label:string;detail:string}> = {
  basic:    {label:'Basic',    detail:'Passive scans, headers, low/medium templates. Safe for production.'},
  medium:   {label:'Medium',   detail:'Active in-scope probing, SQLi/XSS checks. Owner permission required.'},
  advanced: {label:'Advanced', detail:'Full active scan, all severities. Explicit authorization required.'},
};
const SENS_INFO: Record<Sensitivity,{label:string;detail:string}> = {
  'low-noise':  {label:'Low-Noise',  detail:'Single thread, randomised delays — stealth-safe'},
  'normal':     {label:'Normal',     detail:'Moderate concurrency and request spacing'},
  'aggressive': {label:'Aggressive', detail:'Max threads, minimal delays — noisy'},
};
const EST: Record<ScanMode,Record<Sensitivity,string>> = {
  basic:    {'low-noise':'45–90 min',  normal:'10–20 min', aggressive:'3–8 min'},
  medium:   {'low-noise':'2–4 hrs',    normal:'30–60 min', aggressive:'12–25 min'},
  advanced: {'low-noise':'4–8 hrs',    normal:'60–120 min',aggressive:'25–50 min'},
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const hdr = { Authorization: `Bearer ${token}` };

  const [scans,     setScans]     = useState<ScanJob[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [submitting,setSubmitting]= useState(false);
  const [error,     setError]     = useState('');
  const [intel, setIntel] = useState<Record<string, { status: string; report?: any }>>({});
  const [intelLoading, setIntelLoading] = useState<Record<string, boolean>>({});

  const [target,     setTarget]     = useState('');
  const [mode,       setMode]       = useState<ScanMode>('basic');
  const [sensitivity,setSensitivity]= useState<Sensitivity>('normal');

  const canSubmit = target.length > 0;

  const loadScans = async () => {
    try {
      const r = await fetch('/api/scans', {headers:hdr});
      if (r.ok) setScans(await r.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { loadScans(); const iv=setInterval(loadScans,5000); return ()=>clearInterval(iv); }, []);

  // Lazy-load cached Mission Intelligence summaries for completed scans.
  useEffect(() => {
    const completed = scans.filter(s => s.status === 'completed').slice(0, 6);
    completed.forEach(s => {
      if (intel[s.id]) return;
      fetch(`/api/scan/${s.id}/intelligence`, { headers: hdr })
        .then(r => r.json())
        .then(j => setIntel(prev => ({ ...prev, [s.id]: j })))
        .catch(() => {});
    });
  }, [scans]);

  const running  = scans.filter(s=>s.status==='running').length;
  const total    = scans.reduce((a,s)=>a+(s.findings_count||0),0);
  const scored   = scans.filter(s=>s.overall_score!=null);
  const avgScore = scored.length ? Math.round(scored.reduce((a,s)=>a+(s.overall_score||0),0)/scored.length) : null;

  const stats = [
    {label:'TOTAL SCANS', value:scans.length,    icon:Target,        color:'text-primary',   glow:'shadow-primary/20'},
    {label:'LIVE SESSIONS',value:running,           icon:Activity,      color:'text-cyan-400',  glow:'shadow-cyan-400/20'},
    {label:'VULNERABILITIES',value:total,             icon:AlertTriangle, color:'text-amber-400', glow:'shadow-amber-400/20'},
    {label:'SECURITY SCORE', value:avgScore??'—',     icon:Shield,        color:'text-emerald-400',glow:'shadow-emerald-400/20'},
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); if(!canSubmit) return;
    setSubmitting(true); setError('');
    try {
      const r = await fetch('/api/scan', {
        method:'POST',
        headers:{...hdr,'Content-Type':'application/json'},
        body:JSON.stringify({target,mode,sensitivity}),
      });
      if (!r.ok) throw new Error(await r.text());
      const job = await r.json();
      navigate(`/scans/${job.id}`);
    } catch(e:any) { setError(e.message||'Failed to start scan'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await fetch(`/api/scan/${id}`, {method:'DELETE',headers:hdr});
    setScans(prev=>prev.filter(s=>s.id!==id));
  };

  const generateIntel = async (scanId: string) => {
    setIntelLoading(prev => ({ ...prev, [scanId]: true }));
    try {
      const r = await fetch(`/api/scan/${scanId}/intelligence`, {
        method: 'POST',
        headers: { ...hdr, 'Content-Type': 'application/json' },
      });
      const j = await r.json().catch(() => ({}));
      setIntel(prev => ({ ...prev, [scanId]: j }));
      await loadScans();
    } finally {
      setIntelLoading(prev => ({ ...prev, [scanId]: false }));
    }
  };

  return (
    <div className="min-h-screen bg-[#050508] grid-bg-animated relative overflow-hidden">
      <AppNavbar/>
      
      {/* Background Decor */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-secondary/5 rounded-full blur-[100px] pointer-events-none" />

      <main className="max-w-7xl mx-auto px-6 pt-32 pb-12 space-y-8 relative z-10">
        
        {/* Welcome Section */}
        <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} className="space-y-1">
          <h1 className="text-3xl font-mono font-bold tracking-tighter text-foreground flex items-center gap-3">
            <span className="text-primary">&gt;</span> COMMAND_CENTER
          </h1>
          <p className="text-sm font-mono text-muted-foreground/60 max-w-2xl">
            Autonomous vulnerability intelligence and security orchestration engine.
          </p>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s,i)=>(
            <motion.div key={s.label} initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:i*.1, type:'spring', stiffness:100}}
              className={cn("glass-card rounded-2xl p-6 relative overflow-hidden group hover:scale-[1.02] transition-all duration-500", s.glow)}>
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <s.icon className="w-12 h-12" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-mono font-bold tracking-widest text-muted-foreground uppercase">{s.label}</span>
                <div className="flex items-baseline gap-2">
                  <p className={cn("text-3xl font-mono font-bold tracking-tighter", s.color)}>{s.value}</p>
                  <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", s.color.replace('text','bg'))} />
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Launch Engine */}
        <motion.div initial={{opacity:0, scale:0.98}} animate={{opacity:1, scale:1}} transition={{delay:0.4}}
          className="glass-strong rounded-[24px] overflow-hidden border border-white/5 shadow-2xl">
          <button onClick={()=>setShowForm(!showForm)} 
            className="w-full flex items-center justify-between p-6 hover:bg-white/5 transition-all duration-300 group">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 rounded-xl blur-md group-hover:bg-primary/40 transition-all" />
                <div className="relative p-3 rounded-xl bg-primary/10 border border-primary/20">
                  <Zap className="w-5 h-5 text-primary group-hover:scale-110 transition-transform"/>
                </div>
              </div>
              <div className="text-left">
                <h2 className="font-mono text-base font-bold text-foreground">INITIALIZE NEW SCAN</h2>
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Select targets and security parameters</p>
              </div>
            </div>
            <div className={cn("p-2 rounded-full border border-white/10 transition-all duration-500", showForm ? "rotate-180 bg-white/10" : "")}>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </div>
          </button>

          <AnimatePresence>
            {showForm && (
              <motion.div 
                initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}}
                transition={{duration:0.5, ease: [0.04, 0.62, 0.23, 0.98]}}
                className="overflow-hidden"
              >
                <form onSubmit={handleSubmit} className="px-6 pb-8 border-t border-white/5 pt-8 space-y-8">
                  
                  {/* URL Input */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] font-mono font-bold text-muted-foreground tracking-widest uppercase flex items-center gap-2">
                        <Target className="w-3.5 h-3.5 text-primary"/> TARGET_URL
                      </label>
                      <span className="text-[10px] font-mono text-primary/60">REQUIRED</span>
                    </div>
                    <div className="relative group">
                      <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/30 to-secondary/30 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition duration-1000" />
                      <input type="url" value={target} onChange={e=>setTarget(e.target.value)} required
                        className="relative w-full bg-black/40 backdrop-blur-xl border border-white/10 rounded-xl px-5 py-4 text-sm font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/50 transition-all"
                        placeholder="https://example.com"
                      />
                    </div>
                  </div>

                  {/* Mode & Sensitivity */}
                  <div className="grid lg:grid-cols-3 gap-6">
                    <div className="space-y-3 lg:col-span-2">
                      <label className="text-[11px] font-mono font-bold text-muted-foreground tracking-widest uppercase flex items-center gap-2">
                        <ShieldIcon className="w-3.5 h-3.5 text-primary"/> SCAN_PROFILE
                      </label>
                      <div className="grid sm:grid-cols-3 gap-3">
                        {(Object.keys(MODE_INFO) as ScanMode[]).map(m=>{
                          const active = mode === m;
                          const IconComponent = m === 'basic' ? ShieldIcon : m === 'medium' ? Cpu : Skull;
                          const colors = m === 'basic' ? 'text-emerald-400 border-emerald-500/30' : m === 'medium' ? 'text-cyan-400 border-cyan-500/30' : 'text-purple-400 border-purple-500/30';
                          
                          return (
                            <button key={m} type="button" onClick={()=>setMode(m)}
                              className={cn(
                                "relative p-4 rounded-xl border text-left transition-all duration-300 group/btn",
                                active ? cn("bg-white/5", colors) : "bg-black/20 border-white/5 hover:border-white/10"
                              )}>
                              <div className="flex items-center gap-2 mb-2">
                                <IconComponent className={cn("w-4 h-4", active ? colors.split(' ')[0] : "text-muted-foreground")} />
                                <span className={cn("text-xs font-mono font-bold", active ? "text-foreground" : "text-muted-foreground")}>
                                  {MODE_INFO[m].label.toUpperCase()}
                                </span>
                              </div>
                              <p className="text-[10px] font-mono text-muted-foreground leading-tight group-hover/btn:text-muted-foreground transition-colors">
                                {MODE_INFO[m].detail}
                              </p>
                              {active && <div className={cn("absolute bottom-2 right-2 w-1 h-1 rounded-full animate-pulse", colors.split(' ')[0].replace('text','bg'))} />}
                            </button>
                          );
                        })}
                      </div>

                      <div className="grid sm:grid-cols-3 gap-3 pt-4">
                        {(Object.keys(SENS_INFO) as Sensitivity[]).map(s=>{
                          const active = sensitivity === s;
                          const colors = s === 'low-noise' ? 'text-emerald-400 border-emerald-500/30' : s === 'normal' ? 'text-amber-400 border-amber-500/30' : 'text-rose-500 border-rose-500/30';
                          
                          return (
                            <button key={s} type="button" onClick={()=>setSensitivity(s)}
                              className={cn(
                                "p-3 rounded-xl border text-center transition-all duration-300",
                                active ? cn("bg-white/5", colors) : "bg-black/20 border-white/5 hover:border-white/10"
                              )}>
                              <span className={cn("text-[10px] font-mono font-bold", active ? "text-foreground" : "text-muted-foreground")}>
                                {SENS_INFO[s].label.toUpperCase()}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-[11px] font-mono font-bold text-muted-foreground tracking-widest uppercase flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-primary"/> ESTIMATED_WAIT
                      </label>
                      <div className="glass-card rounded-xl p-6 h-[calc(100%-1.75rem)] flex flex-col justify-between border-primary/10">
                        <div className="space-y-1">
                          <p className="text-4xl font-mono font-bold text-primary tracking-tighter">
                            {EST[mode][sensitivity]}
                          </p>
                          <p className="text-[10px] font-mono text-muted-foreground uppercase">{mode} profile • {sensitivity}</p>
                        </div>
                        <div className="space-y-2 mt-6">
                          <div className="h-[2px] w-full bg-white/5 rounded-full overflow-hidden">
                            <motion.div 
                              className="h-full bg-primary"
                              initial={{ width: '10%' }}
                              animate={{ width: mode === 'basic' ? '30%' : mode === 'medium' ? '60%' : '100%' }}
                              transition={{ duration: 1 }}
                            />
                          </div>
                          <p className="text-[9px] font-mono text-muted-foreground/60 italic">
                            * Times are approximate based on engine load.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-6 pt-4">
                    <button type="submit" disabled={!canSubmit||submitting}
                      className="relative w-full sm:w-auto px-12 py-4 rounded-xl bg-primary text-black font-mono font-bold text-sm overflow-hidden group disabled:opacity-30 disabled:cursor-not-allowed">
                      <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                      <div className="relative flex items-center justify-center gap-3">
                        {submitting ? <Activity className="w-4 h-4 animate-spin"/> : <Zap className="w-4 h-4"/>}
                        {submitting ? 'INITIALIZING...' : 'EXECUTE SCAN_'}
                      </div>
                    </button>
                    {error && (
                      <motion.div initial={{opacity:0, x:20}} animate={{opacity:1, x:0}}
                        className="text-xs font-mono text-rose-500 bg-rose-500/10 border border-rose-500/20 px-4 py-2 rounded-lg">
                        ERROR: {error}
                      </motion.div>
                    )}
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Scan List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-mono font-bold text-muted-foreground tracking-widest uppercase flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-primary"/> RECENT_SESSIONS
            </h2>
            <button onClick={loadScans} className="p-2 glass rounded-lg hover:text-primary transition-all group">
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            </button>
          </div>

          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {scans.length === 0 ? (
                <motion.div initial={{opacity:0}} animate={{opacity:1}} className="glass-card rounded-2xl p-12 text-center border-dashed">
                  <Bug className="w-8 h-8 text-muted-foreground/20 mx-auto mb-4" />
                  <p className="text-xs font-mono text-muted-foreground">SYSTEM READY. NO SESSIONS FOUND.</p>
                </motion.div>
              ) : (
                scans.map((scan, idx) => (
                  <motion.div key={scan.id}
                    initial={{opacity:0, x:-20}}
                    animate={{opacity:1, x:0}}
                    exit={{opacity:0, scale:0.95}}
                    transition={{delay: idx * 0.05}}
                    onClick={()=>navigate(`/scans/${scan.id}`)}
                    className="glass-card rounded-2xl p-5 flex items-center justify-between cursor-pointer border border-white/5 hover:border-primary/30 group/card transition-all duration-300"
                  >
                    <div className="flex items-center gap-5 min-w-0">
                      <div className="relative flex-shrink-0">
                        <StatusIndicator status={scan.status}/>
                        {scan.status === 'running' && (
                          <div className="absolute -inset-2 rounded-full border border-primary/20 animate-ping opacity-40" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-primary font-mono text-xs opacity-40">TARGET//</span>
                          <p className="font-mono text-sm font-bold text-foreground truncate">{scan.target}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 text-muted-foreground uppercase">{scan.mode}</span>
                          <span className="w-1 h-1 rounded-full bg-white/20" />
                          <span className="text-[10px] font-mono text-muted-foreground/60">{scan.findings_count || 0} FINDINGS</span>
                          <span className="w-1 h-1 rounded-full bg-white/20" />
                          <span className="text-[10px] font-mono text-muted-foreground/40 uppercase">
                            {scan.created_at ? new Date(scan.created_at).toLocaleDateString() : 'UNKNOWN'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {scan.overall_score != null && (
                        <div className={cn(
                          "px-4 py-2 rounded-xl font-mono text-sm font-bold border",
                          scan.overall_score >= 80 ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5" :
                          scan.overall_score >= 60 ? "text-amber-400 border-amber-500/20 bg-amber-500/5" :
                          "text-rose-500 border-rose-500/20 bg-rose-500/5"
                        )}>
                          {scan.overall_score}
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <button onClick={e => handleDelete(e, scan.id)}
                          className="p-2.5 rounded-xl bg-white/0 hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 transition-all">
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <div className="p-2.5 rounded-xl glass group-hover/card:bg-primary group-hover/card:text-black transition-all">
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Completed Missions: Mission Intelligence Report summaries */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-mono font-bold text-muted-foreground tracking-widest uppercase flex items-center gap-2">
              <Brain className="w-3.5 h-3.5 text-primary" /> MISSION_INTELLIGENCE
            </h2>
            <span className="text-[10px] font-mono text-muted-foreground/60">
              Post-scan AI summaries (full terminal logs processed batch-by-batch)
            </span>
          </div>

          <div className="space-y-3">
            {scans.filter(s => s.status === 'completed').length === 0 ? (
              <div className="glass-card rounded-2xl p-10 text-center border-dashed">
                <Brain className="w-8 h-8 text-muted-foreground/20 mx-auto mb-4" />
                <p className="text-xs font-mono text-muted-foreground">NO COMPLETED MISSIONS YET.</p>
              </div>
            ) : (
              scans
                .filter(s => s.status === 'completed')
                .slice(0, 6)
                .map((s) => {
                  const intelEntry = intel[s.id];
                  const report = intelEntry?.report;
                  const summary = report?.mission_summary || report?.what_happened;
                  const score = typeof report?.score === 'number' ? report.score : s.overall_score;
                  return (
                    <div key={s.id} className="glass-card rounded-2xl p-5 border border-white/5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                            {new Date(s.created_at).toLocaleString()} • {s.mode} • {s.sensitivity}
                          </p>
                          <p className="font-mono text-sm font-bold text-foreground truncate mt-1">
                            {s.target}
                          </p>
                          <p className="text-[11px] font-mono text-foreground/70 mt-3 whitespace-pre-wrap">
                            {summary
                              ? summary
                              : "No Mission Intelligence Report generated yet for this scan."}
                          </p>
                        </div>

                        <div className="flex flex-col items-end gap-3 flex-shrink-0">
                          <div className={cn(
                            "px-4 py-2 rounded-xl font-mono text-sm font-bold border",
                            typeof score === 'number' && score >= 80 ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5" :
                            typeof score === 'number' && score >= 60 ? "text-amber-400 border-amber-500/20 bg-amber-500/5" :
                            typeof score === 'number' ? "text-rose-500 border-rose-500/20 bg-rose-500/5" :
                            "text-muted-foreground border-white/10 bg-white/5"
                          )}>
                            {typeof score === 'number' ? score : '—'}
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={() => navigate(`/scans/${s.id}`)}
                              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-muted-foreground font-mono text-[10px] font-bold uppercase tracking-widest transition-all border border-white/10"
                            >
                              View
                            </button>
                            <button
                              onClick={() => generateIntel(s.id)}
                              disabled={!!intelLoading[s.id]}
                              className="px-4 py-2 rounded-xl bg-primary/20 hover:bg-primary/30 text-primary font-mono text-[10px] font-bold uppercase tracking-widest transition-all border border-primary/30 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {intelLoading[s.id] ? 'Generating…' : (intelEntry?.status === 'ready' ? 'Regenerate' : 'Generate')}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
