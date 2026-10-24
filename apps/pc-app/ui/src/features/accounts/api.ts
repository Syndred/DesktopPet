import type { AppBridge } from "../../../../../../packages/shared-types/src/app";
import type { AccountsSession } from "../../../../../../packages/shared-types/src/features/accounts";
import { useCallback, useEffect, useState } from "react";

export function bridge() { return (window as Window & { lingjing?: AppBridge }).lingjing; }
export async function request<T>(command: string, payload?: unknown): Promise<T> {
  const api = bridge();
  if (!api) throw new Error("请在灵境桌面应用中打开此页面。");
  const result = await api.invoke<T>("accounts", command, payload);
  if (!result.ok) throw Object.assign(new Error(result.message), { code: result.code });
  return ("data" in result ? result.data : result) as T;
}
export const newActionId = () => crypto.randomUUID();
export const errorText = (error: unknown) => error instanceof Error ? error.message : "操作未完成，请重试。";
export function useAccountsSession() {
  const [session, setSession] = useState<AccountsSession | null>(null);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try { const next = await request<AccountsSession>("session"); setSession(next); setError(""); }
    catch (e) { setError(errorText(e)); }
  }, []);
  useEffect(() => {
    let active = true;
    void request<AccountsSession>("session").then(value => { if (active) setSession(value); }).catch(e => { if (active) setError(errorText(e)); });
    const dispose = bridge()?.subscribe("app:session", () => {
      void request<AccountsSession>("session").then(value => { if (active) { setSession(value); setError(""); } })
        .catch(e => { if (active) setError(errorText(e)); });
    });
    return () => { active = false; dispose?.(); };
  }, []);
  return { session, error, refresh };
}
