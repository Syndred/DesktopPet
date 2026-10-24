import { createRoot } from 'react-dom/client';
import App from './app/App';
import './styles/global.css';
import { AppMotionProvider } from './components/motion';
createRoot(document.getElementById('root')!).render(<AppMotionProvider><App/></AppMotionProvider>);
