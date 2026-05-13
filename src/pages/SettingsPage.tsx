import { useState, useEffect } from 'react';
import { AppNavbar } from '@/components/AppNavbar';
import { useAuth } from '@/contexts/AuthContext';
import { Brain, Key, Eye, EyeOff, Save, Check, RefreshCw, Globe, Cpu, Bug } from 'lucide-react';
import { motion } from 'framer-motion';

interface AISettings {
  endpoint: string;
  model: string;
  has_key: boolean;
}

export default function SettingsPage() {
  const { user, token } = useAuth();
  const [aiSettings, setAiSettings] = useState<AISettings>({ endpoint:'', model:'gpt-4o-mini', has_key:false });
  const [endpoint, setEndpoint]   = useState('');
  const [apiKey,   setApiKey]     = useState('');
  const [model,    setModel]      = useState('gpt-4o-mini');
  const [models,   setModels]     = useState<string[]>([]);
  const [showKey,  setShowKey]    = useState(false);
  const [saving,   setSaving]     = useState(false);
  const [saved,    setSaved]      = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult,  setTestResult]  = useState('');

  const authHdr = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetch('/api/settings/ai', { headers: authHdr })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setAiSettings(d);
          setEndpoint(d.endpoint || '');
          setModel(d.model || 'gpt-4o-mini');
        }
      });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const r = await fetch('/api/settings/ai', {
      method:'POST', headers:{...authHdr,'Content-Type':'application/json'},
      body: JSON.stringify({ endpoint, api_key: apiKey || undefined, model }),
    });
    setSaving(false);
    if (r.ok) {
      setSaved(true); setApiKey('');
      setAiSettings(prev => ({...prev, endpoint, model, has_key: prev.has_key || !!apiKey}));
      setTimeout(()=>setSaved(false), 3000);
    }
  };

  const testEndpoint = async () => {
    setTestLoading(true); setTestResult('');
    const r = await fetch('/api/settings/ai/models', { headers: authHdr });
    const d = await r.json();
    if (d.models?.length) {
      setModels(d.models);
      setTestResult(`✓ Connected — ${d.models.length} model(s) available`);
    } else {
      setTestResult(`✗ ${d.error || 'No models returned'}`);
    }
    setTestLoading(false);
  };

  const PRESET_ENDPOINTS = [
    { label: 'OpenAI',         url: 'https://api.openai.com',         model: 'gpt-4o-mini' },
    { label: 'Groq',           url: 'https://api.groq.com/openai',    model: 'llama3-8b-8192' },
    { label: 'Anthropic (CC)', url: 'https://api.anthropic.com',      model: 'claude-3-haiku-20240307' },
    { label: 'Ollama (local)', url: 'http://localhost:11434/v1',       model: 'llama3.2' },
  ];

  return (
    <div className="min-h-screen bg-[#0D0D0D] grid-bg-animated relative overflow-hidden">
        <AppNavbar />
        <main className="max-w-2xl mx-auto px-4 pt-24 pb-6 space-y-6">
        <h1 className="font-mono text-lg font-bold text-foreground">Settings</h1>

        {/* AI Configuration (Fix #8 — moved from scanner page) */}
        <form onSubmit={handleSave} className="glass-card rounded-xl p-5 space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-4 h-4 text-neon-cyan" />
            <span className="font-mono text-sm font-semibold text-foreground">AI Scoring Configuration</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Configure an OpenAI-compatible endpoint to receive AI-powered vulnerability scoring and prioritisation.
            Your API key is encrypted at rest and never exposed to the frontend.
          </p>

          {/* Presets */}
          <div>
            <label className="block text-xs font-mono text-muted-foreground mb-2">Quick Presets</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_ENDPOINTS.map(p => (
                <button key={p.label} type="button"
                  onClick={() => { setEndpoint(p.url); setModel(p.model); }}
                  className={`text-xs font-mono px-3 py-1.5 rounded-md border transition ${
                    endpoint===p.url ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted text-muted-foreground hover:text-foreground'
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Endpoint URL */}
          <div>
            <label className="block text-xs font-mono text-muted-foreground mb-1.5 flex items-center gap-1">
              <Globe className="w-3 h-3" /> API Endpoint URL
            </label>
            <input type="url" value={endpoint} onChange={e=>setEndpoint(e.target.value)}
              className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="https://api.openai.com" />
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs font-mono text-muted-foreground mb-1.5 flex items-center gap-1">
              <Key className="w-3 h-3" /> API Key
              {aiSettings.has_key && <span className="text-[10px] bg-severity-low/20 text-severity-low px-1.5 py-0.5 rounded ml-1">key saved</span>}
            </label>
            <div className="relative">
              <input type={showKey?'text':'password'} value={apiKey} onChange={e=>setApiKey(e.target.value)}
                className="w-full bg-muted border border-border rounded-md px-3 py-2 pr-9 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder={aiSettings.has_key ? "Leave blank to keep existing key" : "sk-..."} />
              <button type="button" onClick={()=>setShowKey(!showKey)}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground">
                {showKey ? <EyeOff className="w-3.5 h-3.5"/> : <Eye className="w-3.5 h-3.5"/>}
              </button>
            </div>
            <p className="text-[10px] font-mono text-muted-foreground/60 mt-1">
              Encrypted with Fernet before storage — never exposed to the frontend.
            </p>
          </div>

          {/* Model selector */}
          <div>
            <label className="block text-xs font-mono text-muted-foreground mb-1.5 flex items-center gap-1">
              <Cpu className="w-3 h-3" /> Model
            </label>
            <div className="flex gap-2">
              {models.length > 0 ? (
                <select value={model} onChange={e=>setModel(e.target.value)}
                  className="flex-1 bg-muted border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                  {models.map(m=><option key={m} value={m}>{m}</option>)}
                </select>
              ) : (
                <input type="text" value={model} onChange={e=>setModel(e.target.value)}
                  className="flex-1 bg-muted border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="gpt-4o-mini" />
              )}
              <button type="button" onClick={testEndpoint} disabled={!endpoint || testLoading}
                className="flex items-center gap-1.5 bg-muted border border-border text-xs font-mono px-3 py-2 rounded-md hover:bg-border transition disabled:opacity-50">
                <RefreshCw className={`w-3.5 h-3.5 ${testLoading?'animate-spin':''}`}/>
                Test
              </button>
            </div>
            {testResult && (
              <p className={`text-xs font-mono mt-1.5 ${testResult.startsWith('✓') ? 'text-severity-low' : 'text-severity-high'}`}>
                {testResult}
              </p>
            )}
          </div>

          <button type="submit" disabled={saving}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground font-mono text-xs px-5 py-2 rounded-md hover:brightness-110 transition disabled:opacity-50">
            {saved ? <><Check className="w-3.5 h-3.5"/>Saved!</> : <><Save className="w-3.5 h-3.5"/>Save Settings</>}
          </button>
        </form>

        {/* Account info */}
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Bug className="w-4 h-4 text-primary" />
            <span className="font-mono text-sm font-semibold text-foreground">Account</span>
          </div>
          <div className="space-y-2 font-mono text-xs text-muted-foreground">
            <p>Username: <span className="text-foreground">{user?.username}</span></p>
            <p>User ID: <span className="text-foreground opacity-60">{user?.id}</span></p>
            <p>Data path: <span className="text-primary">./data/user_{user?.id}/</span></p>
          </div>
        </div>

        {/* App info */}
        <div className="glass-card rounded-xl p-5">
          <h3 className="font-mono text-sm font-semibold text-foreground mb-2">Application Info</h3>
          <div className="space-y-1 font-mono text-xs text-muted-foreground">
            <p>App: <span className="text-foreground font-semibold">BugBuddy.AI</span></p>
            <p>Version: <span className="text-foreground">2.0.0</span></p>
            <p>API: <span className="text-primary">127.0.0.1:5000</span></p>
            <p>UI: <span className="text-primary">localhost:8080</span></p>
          </div>
        </div>
      </main>
    </div>
  );
}
