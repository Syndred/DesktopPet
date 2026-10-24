import { Component, type ReactNode } from 'react';
import { Backpack, Box, ChevronRight, Compass, Home, Leaf, MessageCircle, Minus, Settings, Square, Swords, UserRound, X } from 'lucide-react';
import { features, routes } from './registry';
import { navigate, usePath } from './navigation';
import { useFeatureRequest } from './bridge';
import { Button, Card, EmptyState, PageHeader } from '../components/ui';
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
  const { data, error } = useFeatureRequest('app', 'info');
  return <><PageHeader title="灵境，正在连接每一份陪伴。" description="公共桌面架构已就绪，功能模块接入后会自动出现在这里。"/><Card><h2>已注册功能</h2><div className="module-grid">{features.map(f => <button key={f.id} className="module-tile" onClick={() => navigate(f.routes[0].path)}><Box size={22}/>{f.title}<ChevronRight size={16}/></button>)}</div><p className="muted">主进程：{data?.features?.map((f: any) => f.id).join(' · ') || error || '等待功能模块注册'}</p></Card></>;
}
export default function App() {
  const path = usePath();
  const { data } = useFeatureRequest('app', 'info');
  const route = routes.find(r => r.path === path) || [...routes].filter(r => r.path.includes(':') && new RegExp(`^${r.path.replace(/:[^/]+/g, '[^/]+')}$`).test(path)).sort((a, b) => b.path.length - a.path.length)[0];
  const Page = route?.component;
  if (path.startsWith('/desktop/')) return Page ? <Page/> : null;
  return <div className="app-shell">
    <header className="titlebar"><div className="brand"><img src="./brand/logo-mark.png" alt=""/><strong>灵境</strong><span>让陪伴，自在发生</span></div><div className="window-actions"><button aria-label="最小化" onClick={() => window.lingjing?.window.minimize()}><Minus size={17}/></button><button aria-label="最大化" onClick={() => window.lingjing?.window.maximize()}><Square size={13}/></button><button aria-label="收起到托盘" onClick={() => window.lingjing?.window.close()}><X size={18}/></button></div></header>
    <aside className="sidebar"><nav aria-label="主导航">{navigation.map(n => <button key={n.path} className={`nav-item ${path.startsWith(n.path) ? 'active' : ''}`} onClick={() => navigate(n.path)}><n.icon size={22}/><span>{n.label}</span></button>)}</nav><div className="sidebar-bottom"><button className={`nav-item ${path.startsWith('/resources') ? 'active' : ''}`} onClick={() => navigate('/resources')}><Box size={21}/>角色资源</button><button className={`nav-item ${path.startsWith('/settings') ? 'active' : ''}`} onClick={() => navigate('/settings')}><Settings size={21}/>设置</button><button className="account-button" onClick={() => navigate('/account')}><div className="account-avatar"><UserRound size={21}/></div><span>{data?.user?.username || data?.user?.account || '登录灵境'}</span><ChevronRight size={17}/></button></div></aside>
    <main className="main-content"><PageBoundary key={path}>{Page ? <Page/> : <ModuleStatus/>}</PageBoundary><footer className="app-footer"><img src="./brand/logo-mark.png" alt=""/> 灵境 · 每一位伙伴，都有自己的小世界</footer></main>
  </div>;
}
