import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Loader2, Circle, Clock, Zap, Shield, Search, Globe, Lock, Terminal, Cpu, Activity, Bug, Server } from 'lucide-react';

export type ToolStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'inactive';

export interface Tool {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'recon' | 'asset' | 'vuln';
}

export interface Log {
  job_id: string;
  tool: string;
  level: string;
  message: string;
  timestamp: string;
}

const SCAN_TOOLS: Tool[] = [
  { id: 'recon:subfinder', name: 'Subfinder', description: 'Subdomain enumeration', icon: 'search', category: 'recon' },
  { id: 'recon:dns', name: 'DNS Enum', description: 'DNS record discovery', icon: 'globe', category: 'recon' },
  { id: 'recon:httpx', name: 'Alive Probing', description: 'HTTP probing', icon: 'activity', category: 'recon' },
  { id: 'recon:nmap', name: 'Port Scan', description: 'Network port scanning', icon: 'cpu', category: 'recon' },
  { id: 'asset:whatweb', name: 'WhatWeb', description: 'Technology fingerprinting', icon: 'shield', category: 'asset' },
  { id: 'asset:crawler', name: 'JS Crawler', description: 'JavaScript analysis', icon: 'globe', category: 'asset' },
  { id: 'nuclei', name: 'Nuclei', description: 'Template-based CVE scanner', icon: 'bug', category: 'vuln' },
  { id: 'nikto', name: 'Nikto', description: 'Web server vulnerability scanner', icon: 'terminal', category: 'vuln' },
  { id: 'wapiti', name: 'Wapiti', description: 'Active web app vulnerability tests', icon: 'shield', category: 'vuln' },
  { id: 'zap', name: 'OWASP ZAP', description: 'Passive & active web scanner', icon: 'lock', category: 'vuln' },
];

const TOOL_ICONS: Record<string, React.ElementType> = {
  search: Search, globe: Globe, activity: Activity, cpu: Cpu, shield: Shield,
  bug: Bug, terminal: Terminal, lock: Lock, zap: Zap,
};

const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  recon: { bg: 'bg-purple-500/20', border: 'border-purple-500/50', text: 'text-purple-400', glow: 'shadow-[0_0_12px_rgba(168,85,247,0.4)]' },
  asset: { bg: 'bg-blue-500/20', border: 'border-blue-500/50', text: 'text-blue-400', glow: 'shadow-[0_0_12px_rgba(96,165,250,0.4)]' },
  vuln: { bg: 'bg-red-500/20', border: 'border-red-500/50', text: 'text-red-400', glow: 'shadow-[0_0_12px_rgba(248,113,113,0.4)]' },
};

const PIPELINE_PHASES = [
  { name: 'Phase 1: Recon', tools: ['recon:subfinder', 'recon:dns', 'recon:httpx', 'recon:nmap'] },
  { name: 'Phase 2: Asset Intel', tools: ['asset:whatweb', 'asset:crawler'] },
  { name: 'Phase 3: Vuln Engine', tools: ['nuclei', 'nikto', 'wapiti', 'zap'] },
];

const DONE_KEYWORDS = [
  'complete', 'found', 'posted', 'total', 'skipped', 'finished', 'done',
  'scan completed', 'scan finished', 'vulnerabilities found', 'results',
  'nuclei scan', 'nikto scan', 'wapiti scan', 'zap scan'
];

interface ToolPanelProps {
  logs: Log[];
  scanStatus: string;
  selectedTools: string[];
}

function getToolState(toolId: string, logs: Log[], scanStatus: string): ToolStatus {
  const toolLogs = logs.filter(l => l.tool === toolId || l.tool.includes(toolId.split(':')[1] || toolId));
  
  if (toolLogs.length === 0) {
    if (scanStatus === 'pending') return 'pending';
    if (scanStatus === 'completed' || scanStatus === 'failed') return 'skipped';
    return 'pending';
  }
  
  // Check if ANY log message indicates completion
  const isDone = toolLogs.some(l => {
    const msg = l.message.toLowerCase();
    return DONE_KEYWORDS.some(k => msg.includes(k)) || msg.includes('100%');
  });
  
  if (isDone) return 'completed';
  
  // If the scan is finished, all tools that ran are completed
  if (scanStatus === 'completed') return 'completed';
  if (scanStatus === 'failed') return 'failed';

  // HEURISTIC: If a LATER tool has started, this one is likely done
  const latestLog = logs[logs.length - 1];
  if (latestLog && latestLog.tool !== toolId) {
    const currentToolIdx = SCAN_TOOLS.findIndex(t => t.id === toolId);
    const logToolIdx = SCAN_TOOLS.findIndex(t => latestLog.tool.includes(t.id.split(':')[1] || t.id));
    if (logToolIdx > currentToolIdx && currentToolIdx !== -1) {
      return 'completed';
    }
  }

  return 'running';
}

function getToolFromLog(logTool: string): string | null {
  const logToolLower = logTool.toLowerCase();
  for (const tool of SCAN_TOOLS) {
    if (logToolLower.includes(tool.id) || logToolLower === tool.id.split(':')[1]) {
      return tool.id;
    }
  }
  if (logToolLower.includes('orchestrator')) return 'orchestrator';
  return null;
}

export function ToolPanel({ logs, scanStatus, selectedTools }: ToolPanelProps) {
  const toolStates = useMemo(() => {
    const states: Record<string, ToolStatus> = {};
    
    SCAN_TOOLS.forEach(tool => {
      const isOptionalTool = tool.category === 'vuln';
      const inSelected = !isOptionalTool || selectedTools.length === 0 || selectedTools.includes(tool.id);
      
      if (!inSelected) {
        states[tool.id] = 'inactive';
        return;
      }
      states[tool.id] = getToolState(tool.id, logs, scanStatus);
    });
    
    return states;
  }, [logs, scanStatus, selectedTools]);

  const progress = useMemo(() => {
    const activeTools = SCAN_TOOLS.filter(t => {
      const state = toolStates[t.id];
      return state === 'running' || state === 'completed';
    });
    const total = SCAN_TOOLS.filter(t => toolStates[t.id] !== 'inactive').length;
    return total > 0 ? Math.round((activeTools.length / total) * 100) : 0;
  }, [toolStates]);

  const stats = useMemo(() => {
    const toolOnlyStates = Object.entries(toolStates).filter(([k]) => k !== 'orchestrator');
    const states = toolOnlyStates.map(([, s]) => s);
    return {
      running: states.filter(s => s === 'running').length,
      completed: states.filter(s => s === 'completed').length,
      failed: states.filter(s => s === 'failed').length,
      pending: states.filter(s => s === 'pending').length,
    };
  }, [toolStates]);

  const getPhaseState = (phaseIdx: number) => {
    const phase = PIPELINE_PHASES[phaseIdx];
    const states = phase.tools.map(t => toolStates[t]);
    if (states.some(s => s === 'running')) return 'running';
    if (states.every(s => s === 'completed')) return 'completed';
    if (states.some(s => s === 'pending')) return 'pending';
    return 'pending';
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 h-full overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-mono text-xs text-muted-foreground flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-neon-cyan animate-pulse" />
          TOOL EXECUTION
        </h3>
        {scanStatus === 'running' && (
          <span className="text-[10px] font-mono text-neon-cyan animate-pulse">● LIVE</span>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3 text-[10px]">
        <div className="bg-muted/30 rounded px-2 py-1.5 text-center">
          <div className="text-neon-cyan font-bold">{stats.running}</div>
          <div className="text-muted-foreground">Running</div>
        </div>
        <div className="bg-muted/30 rounded px-2 py-1.5 text-center">
          <div className="text-neon-green font-bold">{stats.completed}</div>
          <div className="text-muted-foreground">Done</div>
        </div>
        <div className="bg-muted/30 rounded px-2 py-1.5 text-center">
          <div className="text-severity-high font-bold">{stats.failed}</div>
          <div className="text-muted-foreground">Failed</div>
        </div>
        <div className="bg-muted/30 rounded px-2 py-1.5 text-center">
          <div className="text-muted-foreground font-bold">{progress}%</div>
          <div className="text-muted-foreground">Progress</div>
        </div>
      </div>

      <div className="relative space-y-2 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
        {PIPELINE_PHASES.map((phase, pIdx) => {
          const phaseState = getPhaseState(pIdx);
          return (
            <div key={pIdx} className="relative z-10">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-mono text-[9px] font-bold text-muted-foreground">
                  {phase.name}
                </h4>
                {phaseState === 'running' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-pulse" />
                )}
              </div>
              <div className="space-y-1.5 ml-2">
                {phase.tools.map((toolId) => {
                  const tool = SCAN_TOOLS.find(t => t.id === toolId);
                  if (!tool) return null;
                  
                  const state = toolStates[toolId] || 'inactive';
                  const categoryCfg = CATEGORY_COLORS[tool.category];
                  const IconComponent = TOOL_ICONS[tool.icon] || Bug;
                  
                  const isRunning = state === 'running';
                  const isCompleted = state === 'completed';
                  const isFailed = state === 'failed';
                  const isInactive = state === 'inactive';
                  
                  return (
                    <motion.div
                      key={toolId}
                      className="flex items-center gap-2 relative"
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {pIdx < 2 && (
                        <div className={`absolute left-2.5 top-4 -bottom-1.5 w-0.5 transition-colors duration-300 ${
                          isCompleted ? 'bg-neon-green/50' : 
                          isRunning ? 'bg-neon-cyan/30' : 'bg-border'
                        }`} />
                      )}
                      
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all duration-300 ${
                        isRunning 
                          ? `${categoryCfg.border} ${categoryCfg.glow} animate-pulse` 
                          : isCompleted
                          ? 'border-neon-green bg-neon-green/10'
                          : isFailed
                          ? 'border-severity-high bg-severity-high/10'
                          : 'border-border bg-muted/30'
                      }`}>
                        {isCompleted ? (
                          <CheckCircle className="w-2.5 h-2.5 text-neon-green" />
                        ) : isRunning ? (
                          <Loader2 className="w-2.5 h-2.5 text-neon-cyan animate-spin" />
                        ) : isFailed ? (
                          <XCircle className="w-2.5 h-2.5 text-severity-high" />
                        ) : isInactive ? (
                          <Circle className="w-2 h-2 text-muted-foreground/30" />
                        ) : (
                          <Clock className="w-2.5 h-2.5 text-muted-foreground" />
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className={`flex items-center gap-1.5 transition-colors duration-200 ${
                          isRunning ? 'text-neon-cyan' :
                          isCompleted ? 'text-foreground' :
                          isFailed ? 'text-severity-high' :
                          isInactive ? 'text-muted-foreground/30' :
                          'text-muted-foreground'
                        }`}>
                          <IconComponent className={`w-2.5 h-2.5 flex-shrink-0 ${categoryCfg.text}`} />
                          <span className="font-mono text-[10px] truncate">{tool.name}</span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })}

      </div>

      <div className="mt-3 pt-2 border-t border-border">
        <div className="flex items-center justify-between text-[9px]">
          <span className="text-muted-foreground">Flow</span>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-pulse" />
              <span className="text-neon-cyan">Run</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-neon-green" />
              <span className="text-neon-green">Done</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
              <span className="text-muted-foreground">Wait</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { SCAN_TOOLS, PIPELINE_PHASES };