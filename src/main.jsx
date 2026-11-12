import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // A phone keeps the home-screen app alive in the background, still running
  // the old code after a release. Each time it comes back to the front, ask
  // for a new sw.js (every release bumps its CACHE); when a new one takes over,
  // reload once. The open table comes back by itself (URL + saved screen).
  const hadWorker = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // The very first install also "changes" the worker: nothing to update then.
    if (!hadWorker || reloading) return;
    reloading = true;
    window.location.reload();
  });
  window.addEventListener('load', async () => {
    const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update().catch(() => {});
    });
  });
}
