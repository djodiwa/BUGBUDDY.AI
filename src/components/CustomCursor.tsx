import { useEffect, useState, useCallback, useRef } from 'react';

interface Ripple {
  id: number;
  x: number;
  y: number;
}

export function CustomCursor() {
  const [position, setPosition] = useState({ x: -100, y: -100 });
  const [isVisible, setIsVisible] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [ripples, setRipples] = useState<Ripple[]>([]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    setPosition({ x: e.clientX, y: e.clientY });
    if (!isVisible) setIsVisible(true);

    const target = e.target as HTMLElement;
    const isClickable = target.closest('a, button, input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])');
    setIsHovering(!!isClickable);
  }, [isVisible]);

  const handleClick = useCallback((e: MouseEvent) => {
    const newRipple: Ripple = {
      id: Date.now(),
      x: e.clientX,
      y: e.clientY,
    };
    setRipples(prev => [...prev, newRipple]);
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== newRipple.id));
    }, 600);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('click', handleClick);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleClick);
    };
  }, [handleMouseMove, handleClick]);

  if (!isVisible) return null;

  return (
    <>
      {/* Cursor glow */}
      <div
        className="cursor-glow"
        style={{ left: position.x, top: position.y }}
      />
      {/* Cursor ring */}
      <div
        className={`cursor-ring ${isHovering ? 'hovering' : ''}`}
        style={{ left: position.x, top: position.y }}
      />
      {/* Cursor dot */}
      <div
        className={`cursor-dot ${isHovering ? 'hovering' : ''}`}
        style={{ left: position.x, top: position.y }}
      />
      {ripples.map(ripple => (
        <div
          key={ripple.id}
          className="click-ripple"
          style={{
            left: ripple.x,
            top: ripple.y,
          }}
        />
      ))}
    </>
  );
}