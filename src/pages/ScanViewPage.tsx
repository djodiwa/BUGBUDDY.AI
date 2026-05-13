import { useParams, useNavigate } from 'react-router-dom';
import { AppNavbar } from '@/components/AppNavbar';
import { StatusIndicator } from '@/components/StatusIndicator';
import { SeverityBadge } from '@/components/SeverityBadge';
import { ToolPanel } from '@/components/ToolPanel';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Download, Brain, RefreshCw, XCircle, ChevronRight, Search, Activity, Clock, Terminal, Bug, AlertTriangle } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';

interface Finding {
  id:string; scan_id:string; tool:string; title:string; description:string;
  severity:string; cvss:number|null; confidence:string; url:string; evidence:string[]; timestamp:string;
}
interface ScanFile { name:string; size:number; modified:string; }
interface Log { job_id:string; tool:string; level:string; message:string; timestamp:string; }
interface ScanJob {
  id:string; target:string; mode:string; sensitivity:string; tools:string[];
  status:string; created_at:string; finished_at?:string; overall_score?:number; findings_count:number;
}

type MissionIntelStatus = 'missing' | 'ready' | 'corrupt' | 'error' | 'processing';
interface MissionIntelReport {
  score?: number;
  risk_level?: string;
  mission_summary?: string;
  what_happened?: string;
  timeline?: any[];
  notable_errors?: any[];
  recommendations?: any[];
  generated_at?: string;
  scan_id?: string;
}

const logColors: Record<string,string> = {
  info:'text-neon-green', warn:'text-severity-medium', error:'text-severity-high',
  debug:'text-muted-foreground', stdout:'text-foreground/80',
};
const toolColors: Record<string,string> = {
  nuclei:'text-purple-400', nikto:'text-blue-400', wapiti:'text-yellow-400',
  zap:'text-orange-400', orchestrator:'text-neon-cyan', precheck:'text-green-400',
  normalizer:'text-pink-400', ai:'text-indigo-400',
  'recon:subfinder':'text-pink-400', 'recon:dns':'text-indigo-400',
  'recon:httpx':'text-yellow-400', 'recon:nmap':'text-red-400',
  'asset:whatweb':'text-blue-400', 'asset:crawler':'text-green-400'
};
const sevOrder: Record<string,number> = {critical:0,high:1,medium:2,low:3,info:4};

export default function ScanViewPage() {
  const { id }     = useParams<{id:string}>();
  const navigate   = useNavigate();
  const { token }  = useAuth();
  const { toast }  = useToast();
  const [scan,     setScan]     = useState<ScanJob|null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [logs,     setLogs]     = useState<Log[]>([]);
  const [files,    setFiles]    = useState<ScanFile[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selectedFile, setSelectedFile] = useState<string|null>(null);
  const [fileContent,  setFileContent]  = useState<string>("");
  const [selected, setSelected] = useState<string|null>(null);
  const [filterSev, setFilterSev] = useState('all');
  const [isRawExpanded, setIsRawExpanded] = useState(false);
  const [intelStatus, setIntelStatus] = useState<MissionIntelStatus>('missing');
  const [intelReport, setIntelReport] = useState<MissionIntelReport | null>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const esRef     = useRef<EventSource|null>(null);

  const hdr = { Authorization: `Bearer ${token}` };

  useEffect(() => { 
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs.length]);

  const loadScan = useCallback(async () => {
    if (!id) return;
    try {
      const r = await fetch(`/api/scan/${id}`, { headers: hdr });
      if (r.ok) setScan(await r.json());
      
      const rf = await fetch(`/api/scan/${id}/files`, { headers: hdr });
      if (rf.ok) setFiles(await rf.json());
      
      const rl = await fetch(`/api/scan/${id}/logs`, { headers: hdr });
      if (rl.ok) setLogs(await rl.json());
      
      const rfind = await fetch(`/api/scan/${id}/findings`, { headers: hdr });
      if (rfind.ok) setFindings(await rfind.json());
    } catch (err) {
      console.error("Failed to load scan data:", err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadIntelligence = useCallback(async () => {
    if (!id) return;
    try {
      const r = await fetch(`/api/scan/${id}/intelligence`, { headers: hdr });
      if (!r.ok) return;
      const j = await r.json();
      setIntelStatus(j.status as MissionIntelStatus);
      setIntelReport(j.report ?? null);
    } catch {
      // ignore
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    loadScan();

    const es = new EventSource(`/api/scan/${id}/stream?token=${token}`);
    esRef.current = es;

    es.onmessage = evt => {
      try {
        const data = JSON.parse(evt.data);
        if (data.__done__) { 
          es.close(); 
          loadScan(); 
          return; 
        }
        if (data.__finding__) {
          const { __finding__, ...f } = data;
          setFindings(prev => {
            if (prev.find(x => x.id === f.id)) return prev;
            return [...prev, f].sort((a,b) =>
              (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9)
            );
          });
        } else {
          setLogs(prev => [...prev, data]);
        }
      } catch {}
    };

    es.onerror = () => { es.close(); };
    return () => { es.close(); esRef.current = null; };
  }, [id, loadScan, token]);

  useEffect(() => {
    if (!id) return;
    if (scan?.status === 'completed') {
      loadIntelligence();

      // Start polling if intelligence is still processing
      const pollInterval = setInterval(async () => {
        if (!id) return;
        try {
          const r = await fetch(`/api/scan/${id}/intelligence`, { headers: hdr });
          if (!r.ok) return;
          const j = await r.json();
          setIntelStatus(j.status as MissionIntelStatus);
          setIntelReport(j.report ?? null);

          // Stop polling when we have a final status
          if (j.status === 'ready' || j.status === 'error') {
            clearInterval(pollInterval);
          }
        } catch {
          // ignore
        }
      }, 3000); // Poll every 3 seconds

      return () => clearInterval(pollInterval);
    }
  }, [id, scan?.status, loadIntelligence]);

  const generateIntelligence = async () => {
    if (!id) return;
    setIntelLoading(true);
    try {
      const r = await fetch(`/api/scan/${id}/intelligence`, { method: 'POST', headers: { ...hdr, 'Content-Type': 'application/json' } });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setIntelStatus(j.status as MissionIntelStatus);
        setIntelReport(j.report ?? null);
      } else {
        setIntelStatus('error');
      }
    } finally {
      setIntelLoading(false);
    }
  };

  useEffect(() => {
    if (scan?.status !== 'running' || !id) return;
    const ival = setInterval(async () => {
      const rf = await fetch(`/api/scan/${id}/files`, { headers: hdr });
      if (rf.ok) setFiles(await rf.json());
    }, 5000);
    return () => clearInterval(ival);
  }, [id, scan?.status, token]);

  const handleCancel = async () => {
    if (!id) return;
    await fetch(`/api/scan/${id}`, { method:'DELETE', headers: hdr });
    loadScan();
  };

  const exportJSON = () => {
    // Show warning if AI summary failed
    if (intelStatus === 'error' || intelReport?.ai_error) {
      toast({
        title: "AI Summary Unavailable",
        description: "The AI mission intelligence report failed to generate. The exported data includes basic analysis only.",
        variant: "destructive",
        action: {
          label: "Download Anyway",
          onClick: () => performJSONExport()
        }
      });
      return;
    }
    performJSONExport();
  };

  const performJSONExport = () => {
    const blob = new Blob([JSON.stringify({scan,findings,logs,intelligence: intelReport, exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`scan-${id}.json`; a.click();
  };

  const exportHTML = () => {
    // Show warning if AI summary failed
    if (intelStatus === 'error' || intelReport?.ai_error) {
      toast({
        title: "AI Summary Unavailable",
        description: "The AI mission intelligence report failed to generate. The exported report includes basic analysis only.",
        variant: "destructive",
        action: {
          label: "Download Anyway",
          onClick: () => performHTMLExport()
        }
      });
      return;
    }
    performHTMLExport();
  };

  const performHTMLExport = () => {
    const aiSection = intelReport ? `
<h2>AI Mission Intelligence</h2>
<div style="background:#1a1a1a;padding:1rem;border-radius:8px;margin:1rem 0">
  <p><b>Security Score:</b> ${intelReport.score}/100</p>
  <p><b>Risk Level:</b> ${intelReport.risk_level}</p>
  <p><b>Summary:</b> ${intelReport.mission_summary}</p>
  ${intelReport.recommendations?.length ? `<p><b>Recommendations:</b></p><ul>${intelReport.recommendations.map(r => `<li>${r}</li>`).join('')}</ul>` : ''}
</div>` : '';

    const html = `<!DOCTYPE html><html><head><title>BugBuddy.AI Report — ${scan?.target}</title>
<style>body{font-family:monospace;background:#0a0e17;color:#d4d8e0;padding:2rem;max-width:900px;margin:0 auto}
h1{color:#00e682}h2{color:#00d4e6;margin-top:2rem}.f{border:1px solid #1e2a3a;padding:1rem;margin:.5rem 0;border-radius:8px}
.critical{border-color:#b040d0}.high{border-color:#e04040}.medium{border-color:#e0a820}.low{border-color:#40c060}.info{border-color:#4080e0}
pre{background:#111;padding:.75rem;border-radius:4px;overflow-x:auto;white-space:pre-wrap;font-size:11px}</style></head><body>
<h1>🐛 BugBuddy.AI Scan Report</h1>
<p><b>Target:</b> ${scan?.target}</p><p><b>Mode:</b> ${scan?.mode?.toUpperCase()} | ${scan?.sensitivity}</p>
<p><b>Tools:</b> ${(scan?.tools||[]).join(', ')}</p><p><b>Status:</b> ${scan?.status}</p>
<p><b>Score:</b> ${scan?.overall_score ?? 'N/A'}/100</p>
<p><b>Date:</b> ${scan?.created_at ? new Date(scan.created_at).toLocaleString() : ''}</p>
${aiSection}
<h2>Findings (${findings.length})</h2>
${findings.map(f=>`<div class="f ${f.severity}"><b>[${f.severity.toUpperCase()}]</b> <b>${f.title}</b> <small>[${f.tool}]</small>
<br/><small>URL: ${f.url} | Confidence: ${f.confidence}</small>
<p>${f.description}</p>
${f.evidence?.filter(Boolean).length?`<pre>${f.evidence.filter(Boolean).join('\n')}</pre>`:''}</div>`).join('')}
<hr/><p style="opacity:.4">Generated by BugBuddy.AI — ${new Date().toISOString()}</p></body></html>`;
    const a = document.createElement('a'); a.href=URL.createObjectURL(new Blob([html],{type:'text/html'})); a.download=`scan-${id}.html`; a.click();
  };

  const viewRawFile = async (name: string) => {
    setSelectedFile(name);
    setFileContent("Loading...");
    const r = await fetch(`/api/scan/${id}/raw/${name}`, { headers: hdr });
    if (r.ok) setFileContent(await r.text());
    else setFileContent("Error loading file.");
  };

  const sevCount = findings.reduce((acc,f)=>({...acc,[f.severity]:(acc[f.severity]||0)+1}),{} as Record<string,number>);
  const filtered = filterSev==='all' ? findings : findings.filter(f=>f.severity===filterSev);
  const detail   = selected ? findings.find(f=>f.id===selected) : null;

  if (loading) return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute inset-0 grid-bg-animated opacity-20" />
      <AppNavbar />
      <div className="flex flex-col items-center justify-center h-[80vh] relative z-10">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-2 border-primary/20 border-t-primary rounded-full mb-4"
        />
        <p className="font-mono text-sm text-muted-foreground tracking-widest animate-pulse">SYNCHRONIZING INTELLIGENCE...</p>
      </div>
    </div>
  );

  if (!scan) return (
    <div className="min-h-screen bg-background"><AppNavbar />
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <div className="glass-card p-12 rounded-2xl inline-block">
          <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4 opacity-50" />
          <h2 className="text-xl font-bold mb-2">Scan Not Found</h2>
          <p className="font-mono text-sm text-muted-foreground mb-6">The requested mission identifier does not exist.</p>
          <button onClick={() => navigate('/dashboard')} className="glass px-6 py-2 rounded-lg text-sm font-mono hover:bg-white/10 transition-all">
            Return to Dashboard
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#080808] text-foreground relative overflow-hidden font-sans">
      <div className="absolute inset-0 grid-bg-animated opacity-30 pointer-events-none" />
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
      
      <AppNavbar />

      <main className="max-w-[1600px] mx-auto px-6 pt-28 pb-12 relative z-10 space-y-6">
        {/* Cinematic Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col lg:flex-row lg:items-end justify-between gap-6"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => navigate('/dashboard')}
                className="p-2.5 rounded-xl glass hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all group"
              >
                <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
              </button>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
                    {scan.target}
                  </h1>
                  <div className={`px-2 py-0.5 rounded-md text-[10px] font-mono border ${
                    scan.status === 'running' ? 'border-neon-cyan/50 text-neon-cyan animate-pulse bg-neon-cyan/5' : 
                    scan.status === 'completed' ? 'border-neon-green/50 text-neon-green bg-neon-green/5' : 
                    'border-white/10 text-muted-foreground bg-white/5'
                  }`}>
                    {scan.status.toUpperCase()}
                  </div>
                </div>
                <p className="font-mono text-xs text-muted-foreground flex items-center gap-2">
                  <span className="text-primary/60">SESSION_ID:</span> 
                  <span className="text-foreground/80">{scan.id.split('-')[0]}...</span>
                  <span className="w-1 h-1 rounded-full bg-white/20" />
                  <span>{scan.mode?.toUpperCase()}</span>
                  <span className="w-1 h-1 rounded-full bg-white/20" />
                  <span>{scan.sensitivity}</span>
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {['running','pending'].includes(scan.status) && (
              <button 
                onClick={handleCancel}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-sm font-mono transition-all hover:scale-105 active:scale-95"
              >
                <XCircle className="w-4 h-4" /> ABORT SESSION
              </button>
            )}
            <div className="h-10 w-[1px] bg-white/5 mx-2 hidden lg:block" />
            <div className="flex p-1 rounded-xl glass">
               <button onClick={loadScan} className="p-2.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all" title="Refresh">
                <RefreshCw className={`w-4 h-4 ${scan.status === 'running' ? 'animate-spin-slow' : ''}`} />
              </button>
              <button onClick={exportJSON} className="flex items-center gap-2 px-4 py-2.5 rounded-lg hover:bg-white/10 text-xs font-mono text-muted-foreground hover:text-foreground transition-all">
                <Download className="w-3.5 h-3.5 text-neon-cyan" /> JSON
              </button>
              <button onClick={exportHTML} className="flex items-center gap-2 px-4 py-2.5 rounded-lg hover:bg-white/10 text-xs font-mono text-muted-foreground hover:text-foreground transition-all">
                <Download className="w-3.5 h-3.5 text-neon-green" /> HTML
              </button>
            </div>
          </div>
        </motion.div>

        {/* Global Progress Strip */}
        <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden relative">
          <motion.div 
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary to-neon-cyan shadow-[0_0_10px_rgba(0,230,130,0.5)]"
            initial={{ width: 0 }}
            animate={{ width: scan.status === 'completed' ? '100%' : '65%' }}
            transition={{ duration: 1 }}
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          {/* Left Column: Stats & Console */}
          <div className="xl:col-span-3 space-y-6">
            
            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'THREATS', value: findings.length, color: 'text-severity-high', icon: Bug },
                { label: 'HEALTH', value: scan.overall_score !== null ? `${scan.overall_score}%` : '---', color: scan.overall_score && scan.overall_score > 70 ? 'text-neon-green' : 'text-severity-medium', icon: Activity },
                { label: 'DURATION', value: scan.finished_at ? 'FINALIZED' : 'LIVE', color: 'text-neon-cyan', icon: Clock },
                { label: 'TOOLS', value: scan.tools?.length || 0, color: 'text-purple-400', icon: Terminal }
              ].map((stat, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.1 }}
                  className="glass-card p-5 rounded-2xl relative group overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <stat.icon className="w-12 h-12" />
                  </div>
                  <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">{stat.label}</p>
                  <p className={`text-3xl font-bold font-mono tracking-tighter ${stat.color}`}>{stat.value}</p>
                </motion.div>
              ))}
            </div>

            {/* Terminal Console */}
            <div className="glass-card rounded-2xl overflow-hidden flex flex-col border border-white/5 shadow-2xl h-[600px]">
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/40" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20 border border-yellow-500/40" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/20 border border-green-500/40" />
                  </div>
                  <div className="h-4 w-[1px] bg-white/10 mx-2" />
                  <p className="font-mono text-xs text-muted-foreground flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5 text-primary" />
                    <span>DEBUG_CONSOLE_V2.0</span>
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-muted-foreground">LINES:</span>
                    <span className="text-[10px] font-mono text-primary">{logs.length}</span>
                  </div>
                  {scan.status === 'running' && (
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      <span className="text-[10px] font-mono text-primary font-bold">STREAMING</span>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex-1 p-6 font-mono text-[11px] overflow-y-auto bg-black/60 custom-scrollbar leading-relaxed">
                {logs.length === 0 ? (
                  <div className="h-full flex items-center justify-center opacity-30 italic">
                    {scan.status === 'pending' ? '> INITIALIZING SESSION...' : '> WAITING FOR OUTPUT...'}
                  </div>
                ) : logs.map((e, i) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={i} 
                    className="flex gap-4 py-0.5 group hover:bg-white/5 transition-colors"
                  >
                    <span className="text-white/20 select-none w-16 text-right">[{new Date(e.timestamp).toLocaleTimeString()}]</span>
                    <span className={`w-24 flex-shrink-0 ${toolColors[e.tool] || 'text-muted-foreground'} opacity-80 font-bold uppercase tracking-tight`}>
                      {e.tool.split(':')[1] || e.tool}
                    </span>
                    <span className={`w-12 flex-shrink-0 font-bold ${logColors[e.level] || 'text-foreground'} opacity-60 text-[9px]`}>
                      {e.level.toUpperCase()}
                    </span>
                    <span className={`${logColors[e.level] || 'text-foreground/90'} break-all`}>
                      {e.message}
                    </span>
                  </motion.div>
                ))}
                <div ref={logEndRef} />
              </div>

              <div className="px-6 py-2 border-t border-white/5 bg-white/[0.01] flex items-center justify-between">
                <div className="flex items-center gap-4 text-[9px] font-mono text-muted-foreground uppercase tracking-widest">
                  <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-primary" /> INFO</span>
                  <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400" /> WARN</span>
                  <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-red-400" /> ERROR</span>
                </div>
                <div className="text-[9px] font-mono text-muted-foreground">
                  BUFFER: 100% | ENCRYPTED: AES-256
                </div>
              </div>
            </div>

            {/* AI Analysis Panel */}
            <AnimatePresence>
              {scan.status === 'completed' && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass-card p-8 rounded-3xl border border-primary/20 bg-primary/[0.02] relative overflow-hidden group"
                >
                  <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none group-hover:bg-primary/20 transition-all duration-700" />
                  
                  <div className="flex flex-col md:flex-row gap-8 items-start relative z-10">
                    <div className="p-5 rounded-3xl bg-primary/10 border border-primary/20 shadow-2xl">
                      <Brain className="w-10 h-10 text-primary" />
                    </div>
                    <div className="flex-1 space-y-4">
                      <div>
                        <h2 className="text-xl font-bold text-white mb-1">Mission Intelligence Report</h2>
                        <p className="font-mono text-[10px] text-primary/60 uppercase tracking-[0.2em]">
                          AI synthesis of full live terminal telemetry + findings (processed batch-by-batch)
                        </p>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                        <div className="space-y-3">
                           {intelStatus === 'processing' ? (
                             <div className="flex flex-col items-center justify-center py-8 space-y-4">
                               <motion.div
                                 animate={{ rotate: 360 }}
                                 transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                 className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full"
                               />
                               <div className="text-center space-y-2">
                                 <p className="text-sm font-mono text-primary font-bold uppercase tracking-widest">
                                   AI Analysis In Progress
                                 </p>
                                 <p className="text-xs text-muted-foreground leading-relaxed max-w-md">
                                   Processing terminal logs and findings to generate mission intelligence report...
                                 </p>
                               </div>
                             </div>
                           ) : intelStatus === 'ready' && intelReport ? (
                             <>
                               <p className="text-xs text-muted-foreground leading-relaxed">
                                 {intelReport.mission_summary || `Mission finalized with ${(sevCount['critical']||0)+(sevCount['high']||0)} critical-path vulnerabilities.`}
                               </p>
                               {intelReport.what_happened && (
                                 <div className="p-4 rounded-xl bg-black/40 border border-white/5">
                                   <p className="text-[11px] font-mono text-foreground/80 whitespace-pre-wrap leading-relaxed">
                                     {intelReport.what_happened}
                                   </p>
                                 </div>
                               )}
                             </>
                           ) : intelStatus === 'error' ? (
                             <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                               <div className="flex items-center gap-3 mb-2">
                                 <XCircle className="w-5 h-5 text-red-400" />
                                 <p className="text-sm font-mono text-red-400 font-bold uppercase tracking-widest">
                                   AI Analysis Failed
                                 </p>
                               </div>
                               <p className="text-xs text-muted-foreground leading-relaxed">
                                 {intelReport?.ai_error ? "AI summarization failed. Reports will include basic analysis only." : "Unable to generate AI report at this time."}
                               </p>
                             </div>
                           ) : (
                             <p className="text-xs text-muted-foreground leading-relaxed">
                               No AI report generated yet. Generate one to summarize what happened during the scan from the full terminal log stream.
                             </p>
                           )}

                          <div className="flex items-center gap-3 pt-1">
                             <button
                               onClick={generateIntelligence}
                               disabled={intelLoading || intelStatus === 'processing'}
                               className="px-4 py-2 rounded-xl bg-primary/20 hover:bg-primary/30 text-primary font-mono text-[10px] font-bold uppercase tracking-widest transition-all border border-primary/30 disabled:opacity-40 disabled:cursor-not-allowed"
                             >
                               {intelStatus === 'processing' ? 'Processing…' : intelLoading ? 'Generating…' : (intelStatus === 'ready' ? 'Regenerate Report' : 'Generate Report')}
                             </button>
                             <button
                               onClick={loadIntelligence}
                               disabled={intelStatus === 'processing'}
                               className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-muted-foreground font-mono text-[10px] font-bold uppercase tracking-widest transition-all border border-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
                             >
                               Refresh
                             </button>
                           </div>
                        </div>

                        <div className="glass-card p-4 rounded-xl border border-white/5 bg-white/5">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-mono text-muted-foreground uppercase">AI Score</span>
                            <span className="text-[10px] font-mono text-primary uppercase">{intelReport?.risk_level || '—'}</span>
                          </div>
                          <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-mono font-bold text-primary tracking-tighter">
                              {typeof intelReport?.score === 'number' ? intelReport.score : (scan.overall_score ?? '—')}
                            </span>
                            <span className="text-[10px] font-mono text-muted-foreground">/100</span>
                          </div>
                          <div className="flex h-1.5 rounded-full overflow-hidden bg-white/5 mt-3">
                            <div
                              className="bg-primary"
                              style={{ width: `${Math.max(0, Math.min(100, (intelReport?.score ?? scan.overall_score ?? 0)))}%` }}
                            />
                          </div>
                          <div className="flex justify-between mt-2 text-[8px] font-mono text-muted-foreground">
                            <span>0</span><span>50</span><span>100</span>
                          </div>
                        </div>
                      </div>

                      {intelStatus === 'ready' && intelReport?.recommendations?.length ? (
                        <div className="pt-2">
                          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2">Recommended Next Steps</p>
                          <ul className="space-y-1 text-[11px] font-mono text-foreground/80">
                            {intelReport.recommendations.slice(0, 6).map((r: any, idx: number) => (
                              <li key={idx} className="flex gap-2">
                                <span className="text-primary">-</span>
                                <span className="whitespace-pre-wrap">{String(r)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

          </div>

          {/* Right Column: Intelligence Feed & Files */}
          <div className="space-y-6">
            
            {/* Tool Panel Card */}
            <div className="glass-card rounded-2xl border border-white/5 overflow-hidden shadow-xl">
              <ToolPanel 
                logs={logs} 
                scanStatus={scan.status} 
                selectedTools={scan.tools || []} 
              />
            </div>

            {/* Real-time Findings Feed */}
            <div className="glass-card rounded-2xl flex flex-col border border-white/5 overflow-hidden shadow-xl h-[400px]">
              <div className="px-5 py-4 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                <h3 className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                  <Activity className="w-3 h-3 text-red-500" /> Intelligence Feed
                </h3>
                <span className="px-2 py-0.5 rounded bg-red-500/10 text-[9px] font-mono text-red-400 border border-red-500/20">
                  {findings.length} DETECTED
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-black/20">
                {findings.length === 0 ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="p-3 rounded-xl glass border border-white/5 animate-pulse">
                        <div className="flex items-center justify-between mb-2">
                          <div className="w-12 h-4 bg-white/10 rounded" />
                          <div className="w-16 h-3 bg-white/5 rounded" />
                        </div>
                        <div className="w-full h-4 bg-white/10 rounded mb-2" />
                        <div className="w-20 h-3 bg-white/5 rounded" />
                      </div>
                    ))}
                    <div className="flex flex-col items-center justify-center pt-4 opacity-20">
                      <Search className="w-5 h-5 animate-pulse mb-2" />
                      <p className="text-[9px] font-mono uppercase tracking-[0.2em]">Intercepting packets...</p>
                    </div>
                  </div>
                ) : findings.map((f) => (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={f.id}
                    onClick={() => setSelected(f.id)}
                    className="p-3 rounded-xl glass hover:bg-white/10 cursor-pointer border border-white/5 transition-all group"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <SeverityBadge severity={f.severity as any} />
                      <span className="text-[9px] font-mono text-muted-foreground opacity-50">{new Date(f.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <h4 className="text-xs font-bold text-white/90 mb-1 group-hover:text-primary transition-colors line-clamp-1">
                      {f.title}
                    </h4>
                    <p className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${toolColors[f.tool] || 'bg-white/20'}`} />
                      {f.tool.toUpperCase()}
                    </p>
                  </motion.div>
                ))}
              </div>
              <div className="p-3 bg-white/[0.02] border-t border-white/5">
                <button 
                  onClick={() => navigate(`/findings?scan=${id}`)}
                  className="w-full py-2 rounded-lg glass-hover text-[10px] font-mono text-muted-foreground uppercase tracking-widest flex items-center justify-center gap-2"
                >
                  View Intelligence Hub <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Raw Assets Card */}
            <div className="glass-card rounded-2xl border border-white/5 overflow-hidden shadow-xl">
               <button 
                onClick={() => setIsRawExpanded(!isRawExpanded)}
                className="w-full px-5 py-4 flex items-center justify-between bg-white/[0.02] hover:bg-white/[0.05] transition-all"
              >
                <h3 className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                  <Download className="w-3.5 h-3.5 text-purple-400" /> Artifacts ({files.length})
                </h3>
                <motion.div animate={{ rotate: isRawExpanded ? 90 : 0 }}>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </motion.div>
              </button>
              
              <AnimatePresence>
                {isRawExpanded && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: 'auto' }}
                    exit={{ height: 0 }}
                    className="overflow-hidden bg-black/40 border-t border-white/5"
                  >
                    <div className="p-3 space-y-2">
                      {files.length === 0 ? (
                        <p className="text-[10px] font-mono text-muted-foreground text-center py-4 italic opacity-30">Generating artifacts...</p>
                      ) : files.map(f => (
                        <div key={f.name} 
                          onClick={() => viewRawFile(f.name)}
                          className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 cursor-pointer group transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-[10px] font-mono text-primary truncate">{f.name}</p>
                            <p className="text-[8px] font-mono text-muted-foreground">{(f.size/1024).toFixed(1)}KB</p>
                          </div>
                          <Download className="w-3 h-3 text-muted-foreground group-hover:text-white transition-colors" />
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>
        </div>

        {/* File Content Modal */}
        <AnimatePresence>
          {selectedFile && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl"
              onClick={() => setSelectedFile(null)}>
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                onClick={e => e.stopPropagation()}
                className="glass-card w-full max-w-6xl h-[85vh] flex flex-col rounded-3xl border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden"
              >
                <div className="flex items-center justify-between px-8 py-5 border-b border-white/5 bg-white/[0.02]">
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary">
                      <Terminal className="w-5 h-5"/>
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-white">{selectedFile}</h3>
                      <p className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase">Raw Telemetry Data</p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedFile(null)} className="p-2 hover:bg-white/10 rounded-xl transition-all">
                    <XCircle className="w-6 h-6 text-muted-foreground hover:text-white" />
                  </button>
                </div>
                <div className="flex-1 overflow-auto p-8 bg-black/60 custom-scrollbar">
                  <pre className="font-mono text-[11px] leading-relaxed text-primary/80 whitespace-pre-wrap selection:bg-primary/20">
                    {fileContent}
                  </pre>
                </div>
                <div className="px-8 py-5 border-t border-white/5 flex justify-end gap-3 bg-white/[0.02]">
                  <a href={`/api/scan/${id}/raw/${selectedFile}?token=${token}`} download={selectedFile}
                    className="flex items-center gap-2 px-6 py-3 bg-primary/20 hover:bg-primary/30 text-primary font-mono text-xs font-bold rounded-xl transition-all border border-primary/30 group"
                  >
                    <Download className="w-4 h-4 group-hover:scale-110 transition-transform" /> DOWNLOAD_ARTIFACT
                  </a>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Intelligence Detail Modal */}
        <AnimatePresence>
          {detail && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-lg"
              onClick={() => setSelected(null)}>
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                onClick={e => e.stopPropagation()}
                className="glass-card w-full max-w-2xl rounded-3xl border border-white/10 p-8 shadow-2xl space-y-6"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <SeverityBadge severity={detail.severity as any}/>
                    <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest opacity-50">[{detail.tool}]</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
                    <span className="text-[10px] font-mono text-muted-foreground uppercase">Confidence:</span>
                    <span className="text-[10px] font-mono text-white">{detail.confidence}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-white tracking-tight leading-tight">{detail.title}</h3>
                  <div className="h-1 w-20 bg-primary/40 rounded-full" />
                </div>

                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {detail.description}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Target Vector</span>
                      <p className="font-mono text-xs text-primary bg-primary/5 rounded-xl px-4 py-3 border border-primary/10 break-all truncate-all">
                        {detail.url}
                      </p>
                    </div>

                    {detail.evidence?.filter(Boolean).length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Digital Evidence</span>
                        <div className="p-4 rounded-2xl bg-black/60 border border-white/5 overflow-x-auto custom-scrollbar">
                          <pre className="font-mono text-[10px] text-neon-green/90 leading-relaxed">
                            {detail.evidence.filter(Boolean).join('\n')}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <button 
                  onClick={() => setSelected(null)}
                  className="w-full py-4 rounded-2xl glass-hover text-sm font-mono font-bold text-white uppercase tracking-widest transition-all"
                >
                  Acknowledge & Close
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </main>
    </div>
  );
}

