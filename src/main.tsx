import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';

// Self-hosted fonts (brief 3): Rajdhani for display/readouts, Inter for body.
import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';

import './styles/app.css';
import { App } from './App';
import { AuthProvider } from './features/auth/AuthProvider';
import { queryClient } from './lib/queryClient';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root is missing from index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
