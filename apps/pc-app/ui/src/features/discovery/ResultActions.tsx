import { useRef, useState } from 'react';
import { ArrowRight, Monitor } from 'lucide-react';
import { request } from '../../app/bridge';
import { navigate } from '../../app/navigation';
import type { DiscoveryCapture } from '../../../../../../packages/shared-types/src/features/discovery';
export function ResultActions({ capture }: { capture: DiscoveryCapture }) {
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  const busy = useRef(false);
  const show = async () => {
    if (busy.current) return; busy.current = true; setPending(true); setError('');
    try { await request('companions', 'desktop', { petId: capture.petId, actionId: crypto.randomUUID(), visible: true }); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { busy.current = false; setPending(false); }
  };
  return <><div className="discovery-actions"><button className="discovery-button primary" disabled={pending || capture.showOnDesktop} onClick={() => void show()}><Monitor size={17}/>{capture.showOnDesktop ? '已放到桌面' : '放到桌面'}</button><button className="discovery-button" onClick={() => navigate(`/companions/${encodeURIComponent(capture.petId)}`)}>查看伙伴详情<ArrowRight size={17}/></button><button className="discovery-button" onClick={() => navigate('/discovery')}>继续探索</button></div>{error ? <p role="alert">{error}</p> : null}</>;
}
