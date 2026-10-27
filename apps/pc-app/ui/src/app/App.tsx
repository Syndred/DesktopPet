import { Component, Suspense, type ReactNode } from 'react';
import { Backpack, Box, ChevronRight, Compass, FlaskConical, Home, Leaf, MessageCircle, Minus, Settings, Square, Swords, UserRound, X } from 'lucide-react';
import { routes } from './registry';
import { navigate, RoutePath, usePath } from './navigation';
import { useCommand } from './bridge';
import { Button, EmptyState } from '../components/ui';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { PageTransition } from '../components/motion';
import './types';

const navigation = [
  { path: '/companions', label: '我的灵宠', icon: Home },
  { path: '/discovery', label: '附近探索', icon: Compass },
  { path: '/battle', label: '对战中心', icon: Swords },
  { path: '/garden', label: '领地', icon: Leaf },
  { path: '/inventory', label: '背包', icon: Backpack },
  { path: '/chat', label: '聊天', icon: MessageCircle }
];
class PageBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() { return this.state.error ? <EmptyState title="页面暂时遇到问题" description={this.state.error} action={<Button onClick={() => this.setState({ error: '' })}>重试</Button>}/> : this.props.children; }
}
function ModuleStatus() {
  return <div className="foundation-page"><EmptyState title="这个小世界还没有打开" description="回到伙伴身边，继续今天的故事吧。" action={<Button onClick={() => navigate('/companions')}>回到我的灵宠</Button>}/></div>;
}
function ScenarioIndicator({ id }: { id: string }) {
  return <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild><button className="scenario-indicator" aria-label="隔离验收场景" data-scenario={id}><FlaskConical size={16}/></button></TooltipTrigger><TooltipContent>隔离验收 · 模拟场景</TooltipContent></Tooltip></TooltipProvider>;
}
export default function App() {
  const path = usePath();
  const { data } = useCommand('app', 'info');
  const accountSession = useCommand('accounts', 'session');
  const route = routes.find(r => r.path === path) || [...routes].filter(r => r.path.includes(':') && new RegExp(`^${r.path.replace(/:[^/]+/g, '[^/]+')}$`).test(path)).sort((a, b) => b.path.length - a.path.length)[0];
  const Page = route?.component;
  if (path.startsWith('/desktop/')) return Page ? <Page/> : null;
  const AccountPage = routes.find(r => r.path === '/account')?.component;
  const isAuth = Boolean(AccountPage && !accountSession.data?.currentUser);
  // Diagnostics are public; all other routes still require the account gate.
  const showAuthGate = isAuth && path !== '/settings/about';
  return <div className={`app-shell ${isAuth ? 'is-auth' : ''}`}>
    <header className="titlebar"><div className="brand"><img src="./brand/logo-mark.png" alt=""/><strong>灵境</strong>{data?.scenario && <ScenarioIndicator id={data.scenario.id}/>}</div><div className="window-actions"><button aria-label="最小化" onClick={() => window.lingjing?.window.minimize()}><Minus size={17}/></button><button aria-label="最大化" onClick={() => window.lingjing?.window.maximize()}><Square size={13}/></button><button aria-label="收起到托盘" onClick={() => window.lingjing?.window.close()}><X size={18}/></button></div></header>
    {!isAuth && <aside className="sidebar"><nav aria-label="主导航">{navigation.map(n => <button key={n.path} className={`nav-item ${path.startsWith(n.path) ? 'active' : ''}`} onClick={() => navigate(n.path)}><n.icon size={22}/><span>{n.label}</span></button>)}</nav><div className="sidebar-bottom"><button className={`nav-item ${path.startsWith('/resources') ? 'active' : ''}`} onClick={() => navigate('/resources')}><Box size={21}/>角色资源</button><button className={`nav-item ${path.startsWith('/settings') ? 'active' : ''}`} onClick={() => navigate('/settings')}><Settings size={21}/>设置</button><button className="account-button" onClick={() => navigate('/account')}><div className="account-avatar"><UserRound size={21}/></div><span>{data?.user?.username || data?.user?.account || '登录灵境'}</span><ChevronRight size={17}/></button></div></aside>}
    <main className="main-content"><PageTransition routeKey={showAuthGate ? 'auth' : path}><RoutePath value={path}><PageBoundary key={showAuthGate ? 'auth' : path}><Suspense fallback={<div className="opening-state" role="status"><img src="./brand/logo-mark.png" alt=""/><p>正在打开…</p></div>}>{showAuthGate ? accountSession.loading ? <div className="opening-state"><img src="./brand/logo-mark.png" alt=""/><p>正在打开你的小世界…</p></div> : AccountPage ? <AccountPage/> : null : Page ? <Page/> : <ModuleStatus/>}</Suspense></PageBoundary></RoutePath></PageTransition></main>
  </div>;
}
