import { useEffect } from 'react';

const SPEED = 0.7;

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      window.scrollBy(0, e.deltaY * SPEED);
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);

  return <>{children}</>;
}
