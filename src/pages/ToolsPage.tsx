import { useState, useEffect } from 'react';
import { AppNavbar } from '@/components/AppNavbar';
import { useAuth } from '@/contexts/AuthContext';
import { CheckCircle, XCircle, AlertTriangle, RefreshCw, Terminal } from 'lucide-react';

interface Tool {
  name: string; bin: string; description: string; version: string; status: 'installed' | 'missing' | 'outdated';
}

const statusIcon = {
  installed: <CheckCircle className="w-4 h-4 text-severity-low" />,
  missing:   <XCircle    className="w-4 h-4 text-severity-high" />,
  outdated:  <AlertTriangle className="w-4 h-4 text-severity-medium" />,
};
const statusLabel = { installed: 'text-severity-low', missing: 'text-severity-high', outdated: 'text-severity-medium' };

const INSTALL_HINTS: Record<string, { debian: string; arch: string }> = {
  'subfinder': { debian: 'Download from github.com/projectdiscovery/subfinder/releases', arch: 'yay -S subfinder-bin' },
  'httpx':     { debian: 'Download from github.com/projectdiscovery/httpx/releases', arch: 'yay -S httpx-bin' },
  'whatweb':   { debian: 'sudo apt install whatweb', arch: 'sudo pacman -S whatweb' },
  'nuclei':    { debian: 'Download from github.com/projectdiscovery/nuclei/releases', arch: 'yay -S nuclei-bin' },
  'nikto':     { debian: 'sudo apt install nikto', arch: 'sudo pacman -S nikto' },
  'wapiti':    { debian: 'sudo apt install wapiti', arch: 'sudo pacman -S wapiti' },
  'zap.sh':    { debian: 'sudo apt install zaproxy', arch: 'yay -S zaproxy' },
  'nmap':      { debian: 'sudo apt install nmap',   arch: 'sudo pacman -S nmap' },
  'sslyze':    { debian: 'pip install sslyze',      arch: 'pip install sslyze' },
};

export default function ToolsPage() {
  const { token } = useAuth();
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/tools', { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setTools(await r.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const installed = tools.filter(t => t.status === 'installed').length;
  const missing   = tools.filter(t => t.status === 'missing').length;

  return (
    <div className="min-h-screen bg-[#0D0D0D] grid-bg-animated relative overflow-hidden">
      <AppNavbar />
      <main className="max-w-7xl mx-auto px-4 pt-24 pb-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-mono text-lg font-bold text-foreground">Scan Tools</h1>
            <p className="text-xs font-mono text-muted-foreground mt-0.5">
              {installed} installed • {missing} missing
            </p>
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Checking...' : 'Re-check'}
          </button>
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="glass-card rounded-xl p-4 animate-pulse h-20" />
            ))}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {tools.map(tool => {
              const hint = INSTALL_HINTS[tool.bin];
              const isOpen = expanded === tool.bin;
              return (
                <div key={tool.name}
                  className={`glass-card rounded-xl p-4 transition ${tool.status === 'missing' ? 'border-red-500/30' : ''}`}>
                  <div className="flex items-start gap-3">
                    {statusIcon[tool.status]}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-semibold text-foreground">{tool.name}</span>
                        <span className={`text-[10px] font-mono font-semibold uppercase ${statusLabel[tool.status]}`}>
                          {tool.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{tool.description}</p>
                      {tool.version && tool.status === 'installed' && (
                        <p className="font-mono text-[10px] text-muted-foreground/60 mt-1 truncate">{tool.version}</p>
                      )}
                      {tool.status === 'missing' && hint && (
                        <button onClick={() => setExpanded(isOpen ? null : tool.bin)}
                          className="text-[10px] font-mono text-primary hover:underline mt-1 flex items-center gap-1">
                          <Terminal className="w-3 h-3" />
                          {isOpen ? 'Hide install instructions' : 'Show install instructions'}
                        </button>
                      )}
                    </div>
                  </div>
                  {isOpen && hint && (
                    <div className="mt-3 border-t border-border pt-3 space-y-2">
                      <div>
                        <p className="text-[9px] font-mono text-muted-foreground uppercase mb-1">Debian / Ubuntu</p>
                        <pre className="text-[10px] font-mono text-neon-green bg-muted rounded px-2 py-1.5 whitespace-pre-wrap">{hint.debian}</pre>
                      </div>
                      <div>
                        <p className="text-[9px] font-mono text-muted-foreground uppercase mb-1">Arch Linux</p>
                        <pre className="text-[10px] font-mono text-neon-green bg-muted rounded px-2 py-1.5 whitespace-pre-wrap">{hint.arch}</pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Setup guide */}
        <div className="glass-card rounded-xl p-5">
          <h2 className="font-mono text-sm font-semibold text-foreground mb-3">Quick Setup Guide</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-mono text-neon-cyan mb-2">Debian / Ubuntu</p>
              <pre className="text-xs font-mono text-foreground bg-muted rounded px-3 py-3 whitespace-pre-wrap">{`sudo apt update
sudo apt install nikto wapiti zaproxy nmap whatweb
pip install sslyze --break-system-packages
# Nuclei, Subfinder, HTTPX: download from GitHub
# Or install via Go if available:
go install -v github.com/projectdiscovery/nuclei/v2/cmd/nuclei@latest
go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest`}</pre>
            </div>
            <div>
              <p className="text-xs font-mono text-neon-cyan mb-2">Arch Linux</p>
              <pre className="text-xs font-mono text-foreground bg-muted rounded px-3 py-3 whitespace-pre-wrap">{`sudo pacman -S nikto wapiti nmap whatweb
yay -S zaproxy nuclei-bin subfinder-bin httpx-bin
pip install sslyze`}</pre>
            </div>
          </div>
          <div className="mt-4 bg-muted/50 border border-border rounded p-3">
            <p className="text-xs font-mono text-muted-foreground">
              <span className="text-severity-medium font-semibold">Note:</span>{' '}
              ZAP must be running as a daemon for the orchestrator to use it via API.
              Start it with: <code className="text-neon-green">zap.sh -daemon -port 8090 -host 127.0.0.1</code>
            </p>
          </div>
        </div>
        </main>
    </div>
  );
}
