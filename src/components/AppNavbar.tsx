import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Bug, LayoutDashboard, AlertTriangle, Wrench, Settings, LogOut, ChevronLeft } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/findings',  label: 'Findings',  icon: AlertTriangle   },
  { to: '/tools',     label: 'Tools',     icon: Wrench          },
  { to: '/settings',  label: 'Settings',  icon: Settings        },
];

export function AppNavbar() {
  const { logout, username } = useAuth();
  const location = useLocation();
  const [isHovered, setIsHovered] = useState<string | null>(null);
  const [visible, setVisible] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const lastScroll = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const current = window.scrollY;
      setScrolled(current > 20);
      if (current > lastScroll.current && current > 100) {
        setVisible(false);
      } else {
        setVisible(true);
      }
      lastScroll.current = current;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header className={cn(
      "fixed top-4 left-1/2 -translate-x-1/2 z-50 transition-all duration-500 w-[95%] max-w-7xl",
      visible ? "translate-y-0 opacity-100" : "-translate-y-20 opacity-0",
      scrolled ? "top-2" : "top-4"
    )}>
      <nav className="relative group/nav">
        {/* Animated Glow following the active item or mouse could be too complex, 
            so we use a subtle ambient glow instead */}
        <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-secondary/10 to-primary/20 rounded-[22px] blur-2xl opacity-0 group-hover/nav:opacity-100 transition-opacity duration-700" />
        
        <div className={cn(
          "relative glass-nav rounded-[20px] px-3 py-2 flex items-center justify-between transition-all duration-300",
          scrolled ? "bg-black/60 backdrop-blur-3xl" : "bg-black/40"
        )}>
          {/* Logo Section */}
          <Link to="/dashboard" className="flex items-center gap-3 pl-2 group">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/40 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative p-2.5 rounded-xl bg-gradient-to-br from-primary/30 to-secondary/10 border border-primary/40 shadow-inner group-hover:scale-110 transition-transform duration-300">
                <Bug className="w-5 h-5 text-primary" />
              </div>
            </div>
            <div className="hidden sm:block">
              <span className="font-mono font-bold text-sm tracking-[0.2em] text-foreground">
                BUGBUDDY<span className="text-primary neon-text">.AI</span>
              </span>
            </div>
          </Link>

          {/* Navigation Items */}
          <div className="hidden md:flex items-center gap-1 bg-white/5 p-1 rounded-2xl border border-white/5">
            {navItems.map(item => {
              const active = location.pathname.startsWith(item.to);
              return (
                <Link key={item.to} to={item.to}
                  onMouseEnter={() => setIsHovered(item.to)}
                  onMouseLeave={() => setIsHovered(null)}
                  className={cn(
                    'relative px-5 py-2.5 rounded-xl text-[11px] font-mono transition-all duration-500 flex items-center gap-2 overflow-hidden',
                    active 
                      ? 'text-primary shadow-[0_0_20px_rgba(0,255,170,0.1)] bg-primary/10' 
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <item.icon className={cn("w-4 h-4 transition-transform duration-300", 
                    active ? "scale-110" : "scale-100",
                    isHovered === item.to && !active && "rotate-12"
                  )} />
                  <span className="relative z-10">{item.label}</span>
                  
                  {active && (
                    <motion.div 
                      layoutId="active-pill"
                      className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent border border-primary/20 rounded-xl"
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                </Link>
              );
            })}
          </div>

          {/* Actions Section */}
          <div className="flex items-center gap-2">
            <div className="hidden lg:flex flex-col items-end pr-2">
              <span className="text-[10px] font-mono text-muted-foreground leading-none">CONNECTED AS</span>
              <span className="text-xs font-mono text-primary font-bold">{username}</span>
            </div>
            
            <div className="h-8 w-[1px] bg-white/10 mx-1 hidden lg:block" />

            <button onClick={logout}
              className="group flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-mono text-muted-foreground hover:text-white hover:bg-red-500/20 border border-transparent hover:border-red-500/30 transition-all duration-300">
              <LogOut className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <span className="hidden sm:inline">EXIT</span>
            </button>
          </div>
        </div>
      </nav>
    </header>
  );
}