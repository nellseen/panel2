import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ui';
import './index.css';

declare global {
  interface Window {
    __bootId?: string;
  }
}

if (typeof window !== 'undefined' && !window.__bootId) {
  window.__bootId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `boot-${Date.now()}`;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary scopeName="Application Shell">
      <App />
    </ErrorBoundary>
  </StrictMode>
);
