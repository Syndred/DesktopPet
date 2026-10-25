import { createRoot } from 'react-dom/client';
import { DesktopCompanion } from './features/companions/DesktopCompanion';
import { AppMotionProvider } from './components/motion';
import './styles/desktop-shell.css';
import './app/types';

document.documentElement.classList.add('cp-desktop-document');
createRoot(document.getElementById('root')!).render(<AppMotionProvider><DesktopCompanion/></AppMotionProvider>);
