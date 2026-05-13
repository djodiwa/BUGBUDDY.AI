import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bug, Shield, Zap, Terminal, Brain, ArrowRight, ChevronDown, Activity, Lock, Cpu, Radio, Eye, Layers, Globe, GitBranch } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};
const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } },
};

const TOOLS = [
  { name: 'Nuclei', desc: 'Template-based CVE scanner with 1000+ templates', color: 'text-purple-400', bg: 'bg-purple-500/10' },
  { name: 'Nikto', desc: 'Web server misconfiguration scanner', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  { name: 'Wapiti', desc: 'Black-box web application vulnerability auditor', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  { name: 'OWASP ZAP', desc: 'Passive & active web security analysis proxy', color: 'text-orange-400', bg: 'bg-orange-500/10' },
  { name: 'Nmap', desc: 'Network port & service discovery engine', color: 'text-red-400', bg: 'bg-red-500/10' },
  { name: 'Subfinder', desc: 'Fast passive subdomain enumeration', color: 'text-pink-400', bg: 'bg-pink-500/10' },
  { name: 'HTTPX', desc: 'Multi-purpose HTTP probing toolkit', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  { name: 'WhatWeb', desc: 'Next-gen website fingerprinting & detection', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  { name: 'SSLyze', desc: 'SSL/TLS security configuration analyzer', color: 'text-violet-400', bg: 'bg-violet-500/10' },
];

const PHASES = [
  { num: '01', title: 'Recon Engine', desc: 'Subdomain enumeration, DNS resolution, alive-host probing, and port scanning — fully automated.', icon: Globe, color: 'from-emerald-500/20 to-emerald-500/5' },
  { num: '02', title: 'Asset Intelligence', desc: 'Technology fingerprinting with WhatWeb and JS endpoint crawling to map your attack surface.', icon: Layers, color: 'from-cyan-500/20 to-cyan-500/5' },
  { num: '03', title: 'Vulnerability Engine', desc: 'Parallel execution of Nuclei, Nikto, Wapiti, and ZAP with configurable concurrency and throttling.', icon: Shield, color: 'from-purple-500/20 to-purple-500/5' },
  { num: '04', title: 'AI Scoring', desc: 'OpenAI-compatible endpoint scores and prioritises findings with contextual risk analysis.', icon: Brain, color: 'from-indigo-500/20 to-indigo-500/5' },
];

const FEATURES = [
  { icon: Terminal, title: 'Live Console', desc: 'Real-time SSE log streaming from every tool directly in your browser.' },
  { icon: Activity, title: 'Real-Time Findings', desc: 'Vulnerabilities appear as they are discovered — no waiting for scan completion.' },
  { icon: Brain, title: 'Mission Intelligence', desc: 'AI-generated post-scan summaries scoring results and recommending fixes.' },
  { icon: Lock, title: 'Encrypted Keys', desc: 'API keys encrypted with Fernet at rest. Never exposed to the frontend.' },
  { icon: Cpu, title: '3 Scan Modes', desc: 'Basic, Medium, Advanced — from passive checks to full active scanning.' },
  { icon: Radio, title: 'Sensitivity Control', desc: 'Low-Noise, Normal, Aggressive — control thread count and request timing.' },
  { icon: Eye, title: 'Raw Reports', desc: 'Download native tool output files — JSON, XML, JSONL, and plaintext.' },
  { icon: GitBranch, title: 'Multi-Target Queue', desc: 'Queue and scan multiple targets in parallel with independent sessions.' },
  { icon: Shield, title: 'AI Chatbot', desc: 'Built-in AI assistant that knows your scans, findings, and helps navigate.' },
];

function TypeWriter({ text, speed = 40 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState('');
  useEffect(() => {
    let i = 0;
    setDisplayed('');
    const iv = setInterval(() => {
      if (i < text.length) { setDisplayed(text.slice(0, i + 1)); i++; }
      else clearInterval(iv);
    }, speed);
    return () => clearInterval(iv);
  }, [text, speed]);
  return <>{displayed}<span className="animate-pulse text-primary">_</span></>;
}

function ParticleField() {
  const preferReduced = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  if (preferReduced) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: 30 }).map((_, i) => (
        <div key={i} className="absolute rounded-full bg-primary/20" style={{
          width: `${2 + Math.random() * 3}px`, height: `${2 + Math.random() * 3}px`,
          left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`,
          animation: `float ${6 + Math.random() * 8}s ease-in-out infinite`,
          animationDelay: `${Math.random() * 5}s`,
        }} />
      ))}
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white overflow-x-hidden">
      {/* Ambient glow orbs */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-primary/[0.04] blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-cyan-500/[0.03] blur-[120px]" />
        <div className="absolute top-[40%] right-[20%] w-[300px] h-[300px] rounded-full bg-purple-500/[0.03] blur-[100px]" />
      </div>

      {/* Floating Nav */}
      <motion.header
        initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="fixed top-5 left-5 right-5 z-50"
      >
        <nav className="relative max-w-6xl mx-auto">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-cyan-500/10 rounded-2xl blur-xl opacity-40" />
          <div className="relative glass-nav rounded-2xl px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/30 rounded-xl blur-md" />
                <div className="relative p-2 rounded-xl bg-gradient-to-br from-primary/20 to-cyan-500/20 border border-primary/30">
                  <Bug className="w-5 h-5 text-primary" />
                </div>
              </div>
              <span className="font-mono font-bold text-sm tracking-widest">
                BUGBUDDY<span className="text-primary neon-text">.AI</span>
              </span>
            </div>
            <div className="hidden md:flex items-center gap-6 text-xs font-mono text-muted-foreground">
              <a href="#features" className="hover:text-primary transition-colors">Features</a>
              <a href="#pipeline" className="hover:text-primary transition-colors">Pipeline</a>
              <a href="#tools" className="hover:text-primary transition-colors">Tools</a>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/login')}
                className="text-xs font-mono text-muted-foreground hover:text-foreground transition px-3 py-2">
                Sign In
              </button>
              <button onClick={() => navigate('/login')}
                className="text-xs font-mono font-semibold bg-primary text-black px-5 py-2 rounded-xl hover:brightness-110 transition-all neon-glow hover:scale-105 active:scale-95">
                Get Started
              </button>
            </div>
          </div>
        </nav>
      </motion.header>

      {/* ═══════════════ HERO ═══════════════ */}
      <section className="relative min-h-screen flex items-center justify-center pt-24 pb-20 px-4">
        <ParticleField />
        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(hsl(155 100% 45%) 1px, transparent 1px), linear-gradient(90deg, hsl(155 100% 45%) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

        <div className="relative z-10 max-w-5xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}>
            {/* Chip */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/20 bg-primary/5 mb-8">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-mono text-primary">v2.0 — AI-Powered Security Scanner</span>
            </div>

            {/* Headline */}
            <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-mono font-bold leading-[0.95] tracking-tight mb-6">
              <span className="block text-foreground">Find Bugs</span>
              <span className="block bg-gradient-to-r from-primary via-emerald-300 to-cyan-400 bg-clip-text text-transparent neon-text">
                Before They
              </span>
              <span className="block text-foreground">Find You</span>
            </h1>

            {/* Subheadline */}
            <p className="max-w-2xl mx-auto text-base sm:text-lg text-muted-foreground leading-relaxed mb-10 font-mono">
              <TypeWriter text="Open-source vulnerability scanner that orchestrates Nuclei, Nikto, Wapiti, ZAP & more — with live streaming, AI scoring, and a terminal-native UI." speed={25} />
            </p>

            {/* CTA */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button onClick={() => navigate('/login')}
                className="group flex items-center gap-3 bg-primary text-black font-mono font-bold text-sm px-8 py-4 rounded-xl hover:brightness-110 transition-all duration-300 neon-glow hover:shadow-lg hover:shadow-primary/30 hover:scale-105 active:scale-95 cursor-pointer">
                <Terminal className="w-5 h-5" />
                Launch Scanner
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
              <a href="#pipeline"
                className="flex items-center gap-2 glass border border-white/10 text-muted-foreground font-mono text-sm px-8 py-4 rounded-xl hover:bg-white/5 hover:text-foreground transition-all duration-300 hover:border-white/20 cursor-pointer">
                <GitBranch className="w-4 h-4" />
                See the Pipeline
              </a>
            </div>
          </motion.div>

          {/* Terminal preview */}
          <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="mt-16 max-w-3xl mx-auto">
            <div className="glass-strong rounded-2xl overflow-hidden border border-white/10">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-white/10 bg-white/[0.02]">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/60" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                  <div className="w-3 h-3 rounded-full bg-green-500/60" />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground ml-3">bugbuddy — scan console</span>
                <div className="ml-auto flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-[10px] font-mono text-primary">LIVE</span>
                </div>
              </div>
              <div className="p-5 font-mono text-xs space-y-1 bg-black/40 max-h-52 overflow-hidden">
                {[
                  { time: '09:12:01', tool: 'orchestrator', color: 'text-cyan-400', msg: 'Target=https://example.com Mode=advanced Sensitivity=normal' },
                  { time: '09:12:02', tool: 'precheck', color: 'text-green-400', msg: '[DNS] example.com → 93.184.216.34' },
                  { time: '09:12:03', tool: 'precheck', color: 'text-green-400', msg: '[TCP] example.com:443 open ✓' },
                  { time: '09:12:04', tool: 'precheck', color: 'text-green-400', msg: '[HTTP] Status 200' },
                  { time: '09:12:05', tool: 'recon:subfinder', color: 'text-pink-400', msg: 'Found 24 subdomains' },
                  { time: '09:12:12', tool: 'recon:httpx', color: 'text-yellow-400', msg: 'Found 18 alive URLs' },
                  { time: '09:12:20', tool: 'recon:nmap', color: 'text-red-400', msg: 'Nmap scan complete for 12 IPs' },
                  { time: '09:12:35', tool: 'nuclei', color: 'text-purple-400', msg: '14 findings posted' },
                  { time: '09:13:01', tool: 'nikto', color: 'text-blue-400', msg: '6 findings posted' },
                  { time: '09:13:42', tool: 'zap', color: 'text-orange-400', msg: 'Active scan: 100%' },
                  { time: '09:14:00', tool: 'orchestrator', color: 'text-cyan-400', msg: 'All tools complete ✓' },
                ].map((l, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 + i * 0.12, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
                    className="flex gap-3">
                    <span className="text-muted-foreground/40 w-16 flex-shrink-0">{l.time}</span>
                    <span className={`${l.color} w-32 flex-shrink-0`}>[{l.tool}]</span>
                    <span className="text-foreground/80">{l.msg}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Scroll indicator */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2 }}
            className="mt-12 flex justify-center">
            <ChevronDown className="w-5 h-5 text-muted-foreground/40" />
          </motion.div>
        </div>
      </section>

      {/* ═══════════════ FEATURES GRID ═══════════════ */}
      <section id="features" className="relative py-28 px-4">
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
            className="text-center mb-16">
            <span className="text-xs font-mono text-primary tracking-widest uppercase">Capabilities</span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-mono font-bold mt-3 tracking-tight">
              Built for <span className="bg-gradient-to-r from-primary to-cyan-400 bg-clip-text text-transparent">Serious Security</span>
            </h2>
            <p className="text-muted-foreground font-mono text-sm mt-4 max-w-xl mx-auto">
              Everything you need to scan, analyse, and remediate — running entirely on your machine.
            </p>
          </motion.div>

          <motion.div variants={containerVariants} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-50px" }}
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f) => (
              <motion.div key={f.title} variants={cardVariants}
                className="group glass-card rounded-2xl p-6 hover:border-primary/20 transition-all duration-300 cursor-pointer hover-glow"
              >
                <div className="p-3 rounded-xl bg-primary/10 w-fit mb-4 group-hover:bg-primary/20 transition-colors duration-300">
                  <f.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-mono font-bold text-sm text-foreground mb-2">{f.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════ PIPELINE ═══════════════ */}
      <section id="pipeline" className="relative py-28 px-4">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.02] to-transparent" />
        <div className="max-w-5xl mx-auto relative z-10">
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
            className="text-center mb-16">
            <span className="text-xs font-mono text-cyan-400 tracking-widest uppercase">Architecture</span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-mono font-bold mt-3 tracking-tight">
              4-Phase <span className="bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">Scan Pipeline</span>
            </h2>
          </motion.div>

          <motion.div variants={containerVariants} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-50px" }}
            className="space-y-6">
            {PHASES.map((p) => (
              <motion.div key={p.num} variants={cardVariants}
                className="group glass-card rounded-2xl p-6 sm:p-8 flex items-start gap-6 hover:border-primary/20 transition-all duration-300 hover-glow cursor-pointer"
              >
                <div className={`hidden sm:flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br ${p.color} border border-white/5 flex-shrink-0`}>
                  <p.icon className="w-7 h-7 text-foreground/80" />
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-mono text-xs text-primary/60 tracking-widest">PHASE {p.num}</span>
                  </div>
                  <h3 className="font-mono font-bold text-lg text-foreground mb-1">{p.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════ TOOLS ═══════════════ */}
      <section id="tools" className="relative py-28 px-4">
        <div className="max-w-5xl mx-auto">
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
            className="text-center mb-16">
            <span className="text-xs font-mono text-purple-400 tracking-widest uppercase">Arsenal</span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-mono font-bold mt-3 tracking-tight">
              Industry-Standard <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">Tools</span>
            </h2>
            <p className="text-muted-foreground font-mono text-sm mt-4 max-w-lg mx-auto">
              Nine integrated security tools — orchestrated, parallelised, and streamed to your dashboard.
            </p>
          </motion.div>

          <motion.div variants={containerVariants} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-50px" }}
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TOOLS.map((t) => (
              <motion.div key={t.name} variants={cardVariants}
                className="glass-card rounded-2xl p-5 transition-all duration-300 cursor-pointer hover:border-white/10"
              >
                <div className={`p-2.5 rounded-xl ${t.bg} w-fit mb-3`}>
                  <Shield className={`w-4 h-4 ${t.color}`} />
                </div>
                <h3 className={`font-mono font-bold text-sm mb-1 ${t.color}`}>{t.name}</h3>
                <p className="text-xs text-muted-foreground">{t.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════ SCAN MODES ═══════════════ */}
      <section className="relative py-28 px-4">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/[0.02] to-transparent" />
        <div className="max-w-5xl mx-auto relative z-10">
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
            className="text-center mb-16">
            <span className="text-xs font-mono text-emerald-400 tracking-widest uppercase">Configurations</span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-mono font-bold mt-3 tracking-tight">
              Your Scan, <span className="bg-gradient-to-r from-emerald-400 to-primary bg-clip-text text-transparent">Your Rules</span>
            </h2>
          </motion.div>

          <motion.div variants={containerVariants} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-50px" }}
            className="grid md:grid-cols-3 gap-5">
            {[
              { mode: 'Basic', time: '3–90 min', desc: 'Passive scans, security headers, low/medium templates. Safe for production environments.', color: 'border-green-500/30', glow: 'hover:shadow-green-500/10', badge: 'bg-green-500/10 text-green-400' },
              { mode: 'Medium', time: '12–60 min', desc: 'Active in-scope probing, SQLi/XSS detection, targeted ZAP analysis. Owner permission required.', color: 'border-cyan-500/30', glow: 'hover:shadow-cyan-500/10', badge: 'bg-cyan-500/10 text-cyan-400' },
              { mode: 'Advanced', time: '25 min–8 hrs', desc: 'Full active scan across all severity levels. Maximum coverage. Explicit authorization required.', color: 'border-purple-500/30', glow: 'hover:shadow-purple-500/10', badge: 'bg-purple-500/10 text-purple-400' },
            ].map((m) => (
              <motion.div key={m.mode} variants={cardVariants}
                className={`glass-card rounded-2xl p-6 border ${m.color} transition-all duration-300 hover:scale-[1.02] ${m.glow} hover:shadow-lg cursor-pointer`}
              >
                <span className={`inline-block text-xs font-mono font-bold px-3 py-1 rounded-lg mb-4 ${m.badge}`}>
                  {m.mode.toUpperCase()}
                </span>
                <h3 className="font-mono font-bold text-lg text-foreground mb-1">{m.mode}</h3>
                <p className="font-mono text-xs text-muted-foreground mb-4">{m.time} estimated</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{m.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════════════ FINAL CTA ═══════════════ */}
      <section className="relative py-28 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}>
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-primary/10 border border-primary/20 neon-glow mb-8">
              <Bug className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-mono font-bold tracking-tight mb-5">
              Ready to <span className="bg-gradient-to-r from-primary to-cyan-400 bg-clip-text text-transparent">hunt bugs</span>?
            </h2>
            <p className="text-muted-foreground font-mono text-sm mb-10 max-w-lg mx-auto">
              Deploy locally, scan targets you own, and get AI-scored findings in minutes. Open source. No cloud. Full control.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button onClick={() => navigate('/login')}
                className="group flex items-center gap-3 bg-primary text-black font-mono font-bold text-sm px-10 py-4 rounded-xl hover:brightness-110 transition-all duration-300 neon-glow hover:shadow-lg hover:shadow-primary/30 hover:scale-105 active:scale-95 cursor-pointer">
                <Terminal className="w-5 h-5" />
                Start Scanning
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Bug className="w-4 h-4 text-primary" />
            <span className="font-mono text-xs text-muted-foreground">
              BUGBUDDY<span className="text-primary">.AI</span> v2.0
            </span>
          </div>
          <p className="text-[10px] font-mono text-muted-foreground/50">
            Only scan targets you own or have explicit written permission to test.
          </p>
        </div>
      </footer>
    </div>
  );
}
