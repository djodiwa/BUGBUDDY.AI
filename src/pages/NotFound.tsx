import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen bg-[#0D0D0D] grid-bg-animated items-center justify-center">
      <div className="text-center">
        <h1 className="mb-4 text-6xl font-bold text-foreground neon-text">404</h1>
        <p className="mb-4 text-xl font-mono text-muted-foreground">Page not found</p>
        <a href="/" className="text-primary hover:text-primary/80 transition">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;