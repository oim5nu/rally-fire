import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import GlobalFeedback from './components/GlobalFeedback.tsx';
import { ActivityProvider } from './lib/activity.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ActivityProvider>
      <GlobalFeedback />
      <App />
    </ActivityProvider>
  </StrictMode>,
);
