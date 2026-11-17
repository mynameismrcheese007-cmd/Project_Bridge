import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { AuthProvider } from './auth/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import './styles/tokens.css';
import './styles/base.css';
import './styles.css';
import './styles/primitives.css';
import './styles/motion.css';
import './styles/pages.css';
import './styles/sharp.css';
import './styles/editor.css';
import { applyStoredTheme } from './lib/theme';

applyStoredTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
