import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Bug, Terminal, Lock, UserPlus, LogIn, Eye, EyeOff, Shield, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [tab,  setTab]  = useState<'login'|'register'>('login');
  const [uname, setUname] = useState('');
  const [email, setEmail] = useState('');
  const [pwd,   setPwd]   = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      if (tab === 'login') {
        const ok = await login(uname, pwd);
        if (ok) navigate('/dashboard');
        else setError('Invalid username or password');
      } else {
        const res = await register(uname, pwd, email || undefined);
        if (res.ok) navigate('/dashboard');
        else setError(res.error || 'Registration failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050508] grid-bg-animated flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Ambient Glow */}
      <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-primary/10 rounded-full blur-[100px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-secondary/10 rounded-full blur-[80px] pointer-events-none animate-pulse" />
      
      <motion.div 
        initial={{ opacity:0, y:20, scale:0.98 }} 
        animate={{ opacity:1, y:0, scale:1 }}
        transition={{ duration:0.5, ease: "easeOut" }} 
        className="w-full max-w-[420px] relative z-10"
      >
        {/* Logo Section */}
        <div className="text-center mb-10">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, type: "spring" }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-[24px] bg-primary/10 border border-primary/20 shadow-[0_0_30px_rgba(var(--primary),0.1)] mb-6 group"
          >
            <Bug className="w-10 h-10 text-primary group-hover:scale-110 transition-transform duration-500" />
          </motion.div>
          <h1 className="font-mono font-bold text-3xl tracking-tighter text-foreground mb-2">
            BUGBUDDY<span className="text-primary neon-text">.AI</span>
          </h1>
          <p className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-[0.2em]">Autonomous Intelligence Engine</p>
        </div>

        <div className="glass-strong rounded-[32px] overflow-hidden border border-white/5 shadow-2xl">
          {/* Custom Tabs */}
          <div className="flex p-1.5 bg-black/20 backdrop-blur-md">
            {(['login','register'] as const).map(t => (
              <button 
                key={t} 
                onClick={() => { setTab(t); setError(''); }}
                className={`relative flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[11px] font-mono font-bold tracking-widest uppercase transition-all duration-300 ${
                  tab===t ? 'text-black' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab === t && (
                  <motion.div 
                    layoutId="activeTab"
                    className="absolute inset-0 bg-primary rounded-2xl shadow-[0_0_15px_rgba(var(--primary),0.4)]"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  {t==='login' ? <LogIn className="w-3.5 h-3.5"/> : <UserPlus className="w-3.5 h-3.5"/>}
                  {t==='login' ? 'Sign In' : 'Register'}
                </span>
              </button>
            ))}
          </div>

          <div className="p-8 pt-10">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-8 h-[1px] bg-primary/30" />
              <span className="font-mono text-[10px] text-primary/60 tracking-widest uppercase">
                {tab==='login' ? 'Command access' : 'Initialize account'}
              </span>
            </div>

            <AnimatePresence mode="wait">
              <motion.form 
                key={tab} 
                initial={{ opacity:0, x:10 }} 
                animate={{ opacity:1, x:0 }}
                exit={{ opacity:0, x:-10 }} 
                transition={{ duration:0.3 }}
                onSubmit={handleSubmit} 
                className="space-y-6"
              >
                <div className="space-y-2">
                  <label className="text-[10px] font-mono font-bold text-muted-foreground tracking-widest uppercase ml-1">Username</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                      <Terminal className="w-4 h-4 text-primary/40 group-focus-within:text-primary transition-colors" />
                    </div>
                    <input 
                      type="text" 
                      value={uname} 
                      onChange={e=>setUname(e.target.value)} 
                      required
                      className="w-full bg-black/40 border border-white/5 rounded-2xl pl-12 pr-4 py-3.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/20 focus:outline-none focus:border-primary/50 focus:bg-black/60 transition-all"
                      placeholder="root_user" 
                      autoComplete="username" 
                    />
                  </div>
                </div>

                {tab==='register' && (
                  <motion.div 
                    initial={{ opacity:0, height:0 }}
                    animate={{ opacity:1, height:'auto' }}
                    className="space-y-2"
                  >
                    <label className="text-[10px] font-mono font-bold text-muted-foreground tracking-widest uppercase ml-1">Email <span className="opacity-40 italic">(optional)</span></label>
                    <input 
                      type="email" 
                      value={email} 
                      onChange={e=>setEmail(e.target.value)}
                      className="w-full bg-black/40 border border-white/5 rounded-2xl px-4 py-3.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/20 focus:outline-none focus:border-primary/50 focus:bg-black/60 transition-all"
                      placeholder="operator@bugbuddy.ai" 
                    />
                  </motion.div>
                )}

                <div className="space-y-2">
                  <label className="text-[10px] font-mono font-bold text-muted-foreground tracking-widest uppercase ml-1">Password</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                      <Lock className="w-4 h-4 text-primary/40 group-focus-within:text-primary transition-colors" />
                    </div>
                    <input 
                      type={showPwd?'text':'password'} 
                      value={pwd} 
                      onChange={e=>setPwd(e.target.value)} 
                      required
                      className="w-full bg-black/40 border border-white/5 rounded-2xl pl-12 pr-12 py-3.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/20 focus:outline-none focus:border-primary/50 focus:bg-black/60 transition-all"
                      placeholder="••••••••" 
                      autoComplete={tab==='login'?'current-password':'new-password'} 
                    />
                    <button 
                      type="button" 
                      onClick={()=>setShowPwd(!showPwd)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-primary transition-colors"
                    >
                      {showPwd ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                    </button>
                  </div>
                </div>

                {error && (
                  <motion.div 
                    initial={{ opacity:0, y:-10 }}
                    animate={{ opacity:1, y:0 }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[11px] font-mono text-rose-500"
                  >
                    <Activity className="w-3.5 h-3.5 flex-shrink-0" />
                    {error}
                  </motion.div>
                )}

                <button 
                  type="submit" 
                  disabled={loading}
                  className="group relative w-full overflow-hidden rounded-2xl bg-primary px-4 py-4 text-[12px] font-mono font-bold tracking-widest uppercase text-black transition-all hover:brightness-110 disabled:opacity-50"
                >
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                  <span className="relative z-10 flex items-center justify-center gap-3">
                    {loading ? (
                      <Activity className="w-4 h-4 animate-spin" />
                    ) : (
                      <Shield className="w-4 h-4" />
                    )}
                    {loading ? 'Processing...' : tab==='login' ? 'Execute Login' : 'Register Operator'}
                  </span>
                </button>
              </motion.form>
            </AnimatePresence>
          </div>
        </div>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-8 flex items-center justify-center gap-3 px-6 py-3 rounded-2xl border border-white/5 bg-white/[0.02]"
        >
          <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          <p className="text-[9px] font-mono text-muted-foreground tracking-tight leading-none uppercase">
            AUTHORIZED_ACCESS_ONLY // SCAN_PERMISSIONS_REQUIRED
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
