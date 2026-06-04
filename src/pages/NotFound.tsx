import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center">
        <h1 className="text-2xl sm:text-4xl font-semibold mb-4">404 - Page Not Found</h1>
        <p className="text-base sm:text-xl text-muted-foreground mb-4">Oops! The page you're looking for doesn't exist.</p>
        <a href="/" className="text-primary hover:text-primary-glow underline">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
