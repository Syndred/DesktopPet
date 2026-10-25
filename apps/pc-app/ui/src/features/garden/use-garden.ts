import { useCallback, useEffect, useRef, useState } from "react";
import type { GardenCommand, GardenResult, GardenSnapshot } from "../../../../../../packages/shared-types/src/features/garden";
import { gardenPetIdentity, petIdentityLabel } from './PetIdentity';

interface Bridge {
  invoke<T>(feature: string, command: string, payload?: unknown): Promise<GardenResult<T>>;
  subscribe?(event: string, listener: (data: unknown) => void): () => void;
}
const bridge = () => (window as unknown as { lingjing?: Bridge }).lingjing;
type Pending = { owner: string; command: GardenCommand; input: Record<string, unknown> };
const pendingKey = (owner: string) => `lingjing:garden:pending:v1:${owner}`;
function readPending(owner: string): Pending | null {
  try {
    const value = JSON.parse(localStorage.getItem(pendingKey(owner)) || "null") as Pending | null;
    return value?.owner === owner && value.input?.actionId ? value : null;
  } catch { return null; }
}

export function useGarden() {
  const [snapshot, setSnapshot] = useState<GardenSnapshot | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [now, setNow] = useState(Date.now());
  const offset = useRef(0);
  const locked = useRef(false);
  const mounted = useRef(true);
  const ownerRef = useRef<string | null>(null);
  const requestSerial = useRef(0);
  const refresh = useCallback(async () => {
    const serial = ++requestSerial.current;
    try {
      const api = bridge(); if (!api) throw new Error("请在灵境桌面应用中打开菜园");
      const result = await api.invoke<GardenSnapshot>("garden", "snapshot");
      if (!mounted.current || serial !== requestSerial.current) return;
      if (!result.ok) { setSnapshot(null); setErrorCode(result.code); throw new Error(result.message); }
      ownerRef.current = result.data.ownerAccountId;
      offset.current = result.data.serverTime - Date.now();
      setSnapshot(result.data); setRevision(result.revision); setNow(result.data.serverTime);
      setPending(readPending(result.data.ownerAccountId));
      setError(""); setErrorCode("");
    } catch (failure) {
      if (mounted.current && serial === requestSerial.current) setError(failure instanceof Error ? failure.message : "读取菜园失败，请重试");
    } finally { if (mounted.current && serial === requestSerial.current) setLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true; void refresh();
    const stop = bridge()?.subscribe?.("garden:changed", () => { void refresh(); });
    const stopCompanions = bridge()?.subscribe?.("companions:changed", event => {
      if (event && typeof event === 'object' && 'ownerAccountId' in event
        && typeof event.ownerAccountId === 'string' && event.ownerAccountId === ownerRef.current) void refresh();
    });
    const reset = () => { setSnapshot(null); setPending(null); ownerRef.current = null; void refresh(); };
    const sessionStops = ['accounts:changed', 'app:session', 'accounts:session-changed'].map(name => bridge()?.subscribe?.(name, reset));
    const clock = window.setInterval(() => { setNow(Date.now() + offset.current); }, 1000);
    const focus = () => { void refresh(); };
    window.addEventListener("focus", focus);
    return () => { mounted.current = false; stop?.(); stopCompanions?.(); sessionStops.forEach(stop => stop?.()); clearInterval(clock); window.removeEventListener("focus", focus); };
  }, [refresh]);
  const execute = useCallback(async (action: Pending, success: string) => {
    if (locked.current) return false;
    if (ownerRef.current !== action.owner) { setError("账号已切换，请刷新后操作"); return false; }
    locked.current = true; setBusy(true); setError(""); setMessage("");
    let succeeded: Extract<GardenResult<unknown>, {ok:true}> | false = false;
    try {
      const api = bridge(); if (!api) throw new Error("桌面连接已断开");
      // Persist the exact action before IPC. An interrupted reply must retry the same action.
      localStorage.setItem(pendingKey(action.owner), JSON.stringify(action)); setPending(action);
      const result = await api.invoke<unknown>("garden", action.command, action.input);
      if (!mounted.current || ownerRef.current !== action.owner) return false;
      if (!result.ok && ['CLOUD_APPLY_PENDING','GARDEN_CLOUD_UNAVAILABLE','CLOUD_RECEIPT_MISMATCH','CLOUD_STALE_READBACK'].includes(result.code)) { setError(result.message); return false; }
      localStorage.removeItem(pendingKey(action.owner));
      setPending(null);
      if (!result.ok) {
        await refresh();
        setError(result.message); return false;
      }
      succeeded = result;
      await refresh();
      setMessage(result.replayed ? `${success}（原操作已确认）` : success);
    } catch (failure) {
      if (mounted.current) setError(`${failure instanceof Error ? failure.message : "连接中断"}。可安全重试原操作。`);
    } finally {
      locked.current = false; if (mounted.current) setBusy(false);
    }
    return succeeded;
  }, [refresh]);
  const mutate = useCallback((command: GardenCommand, payload: Record<string, unknown>, success: string) => {
    if (!snapshot || busy || locked.current) return Promise.resolve(false);
    if (readPending(snapshot.ownerAccountId)) { setError("上次操作的结果尚未确认，请先重试原操作"); return Promise.resolve(false); }
    return execute({ owner: snapshot.ownerAccountId, command, input: { ...payload, sessionOwnerAccountId: snapshot.ownerAccountId, actionId: crypto.randomUUID(), expectedRevision: revision } }, success);
  }, [snapshot, busy, execute, revision]);
  const retry = () => {
    if (!pending) return Promise.resolve(false);
    const originalPetId = pending.input.petId;
    const originalPet = snapshot?.ownerAccountId === pending.owner ? snapshot.pets.find(pet => pet.petId === originalPetId && pet.ownerAccountId === pending.owner) : undefined;
    const identity = originalPet?.templateId ? gardenPetIdentity(originalPet) : null;
    const target = typeof originalPetId === 'string' ? petIdentityLabel(identity) : '';
    const message = pending.command === 'feed' && target ? `已确认${target}的原喂养操作。`
      : pending.command === 'garrison' && target ? `已确认${target}的原驻守操作。` : '原操作已确认保存。';
    return execute(pending, message);
  };
  return { snapshot, revision, loading, busy, message, error, errorCode, pending, now, refresh, mutate, retry };
}
export type GardenState = ReturnType<typeof useGarden>;
