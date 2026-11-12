import { createRoot } from 'react-dom/client';
import 'flag-icons/css/flag-icons.min.css';
import './styles/template.css';
import './styles/app.css';
import './styles/v2.css';
import App from './App.jsx';
import { ScoutProvider } from './store.jsx';

createRoot(document.getElementById('root')).render(
  <ScoutProvider>
    <App />
  </ScoutProvider>
);
