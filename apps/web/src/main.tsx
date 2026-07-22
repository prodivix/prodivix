import '@/esm-bridge/registerHostReactBridge';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { RouterProvider, createBrowserRouter } from 'react-router';
import './index.css';
import { createRoutes } from './App';
import { initI18n } from './i18n';
import { ThemeSync } from './components/ThemeSync';
import { AuthSessionSync } from './auth/AuthSessionSync';

initI18n().then((i18n) => {
  const router = createBrowserRouter(createRoutes(i18n));
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <ThemeSync />
        <AuthSessionSync />
        <RouterProvider router={router} />
      </I18nextProvider>
    </StrictMode>
  );
});
