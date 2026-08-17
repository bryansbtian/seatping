import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import App from './App.tsx'
import './index.css'

document.addEventListener(
  "wheel",
  (event) => {
    const active = document.activeElement;
    if (
      active instanceof HTMLInputElement &&
      active.type === "number" &&
      active === event.target
    ) {
      event.preventDefault();
    }
  },
  { passive: false },
);

createRoot(document.getElementById("root")!).render(
  <>
    <App />
    <Analytics />
  </>
);
