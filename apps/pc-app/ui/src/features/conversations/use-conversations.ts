import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConversationClient, ConversationCommands, ConversationMessage, ConversationSnapshot } from '../../../../../../packages/shared-types/src/features/conversations';
import { desktopConversationClient } from './client';

export function useConversations(client: ConversationClient = desktopConversationClient, initialPetId?: string) {
  const [data, setData] = useState<ConversationSnapshot | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const current = useRef<ConversationSnapshot | null>(null);
  const epoch = useRef(0);
  const loadSequence = useRef(0);
  const mounted = useRef(true);
  const update = useCallback((value: ConversationSnapshot | null) => { current.current = value; setData(value); }, []);
  const request = useCallback(async <K extends keyof ConversationCommands>(command: K, payload: ConversationCommands[K]['input'], expected?: ConversationSnapshot | null) => {
    const result = await client.invoke(command, { ...payload, ...(expected ? { expectedAccountId: expected.accountId, expectedSessionRevision: expected.sessionRevision } : {}) });
    if (!result.ok) throw Object.assign(new Error(result.message), { code: result.code });
    return result.data;
  }, [client]);
  const reload = useCallback(async (petId?: string, foreground = false) => {
    const sequence = ++loadSequence.current;
    const identity = epoch.current;
    if (foreground) setLoading(true);
    try {
      const value = await request('snapshot', { ...(petId ? { petId } : {}) });
      if (!mounted.current || sequence !== loadSequence.current || identity !== epoch.current) return;
      update(value); setError('');
    } catch (cause) {
      if (!mounted.current || sequence !== loadSequence.current || identity !== epoch.current) return;
      const code = (cause as { code?: string }).code;
      if (code === 'AUTH_REQUIRED' || code === 'SESSION_CHANGED') update(null);
      setError(cause instanceof Error ? cause.message : '读取聊天失败，请重试。');
    } finally { if (mounted.current && sequence === loadSequence.current) setLoading(false); }
  }, [request, update]);
  useEffect(() => {
    mounted.current = true;
    void reload(initialPetId, true);
    const sessionOff = client.onSessionChanged(() => {
      epoch.current++; loadSequence.current++; update(null); setError(''); setLoading(true);
      void reload(undefined, true);
    });
    const off = client.subscribe(event => {
      const snapshot = current.current;
      if (!snapshot || event.accountId !== snapshot.accountId) return;
      if (event.type === 'changed') { void reload(snapshot.petId ?? undefined); return; }
      if (event.petId === snapshot.petId && event.actionId) {
        update({ ...snapshot, messages: (snapshot.messages ?? []).map(message =>
          message.actionId === event.actionId && message.role === 'assistant' ? {
            ...message, content: event.content ?? message.content, status: event.status ?? message.status,
            errorCode: event.errorCode ?? null
          } : message) });
      }
      if (event.status && !['pending', 'streaming'].includes(event.status)) void reload(current.current?.petId ?? undefined);
    });
    return () => { mounted.current = false; epoch.current++; off(); sessionOff(); };
  }, [client, initialPetId, reload, update]);
  const choose = useCallback(async (petId: string) => {
    const previous = current.current;
    const identity = epoch.current;
    const sequence = ++loadSequence.current;
    // Clear the previous instance immediately, including its memories and persona.
    setLoading(true); update(null); setError('');
    try {
      const value = await request('select', { petId, actionId: crypto.randomUUID() }, previous);
      if (mounted.current && identity === epoch.current && sequence === loadSequence.current) update(value);
    } catch (cause) {
      if (mounted.current && identity === epoch.current && sequence === loadSequence.current) {
        update(previous);
        setError(cause instanceof Error ? cause.message : '切换伙伴失败。');
      }
    } finally { if (mounted.current && sequence === loadSequence.current) setLoading(false); }
  }, [request, update]);
  const send = useCallback(async (text: string, retryActionId?: string) => {
    const snapshot = current.current;
    if (!snapshot?.petId) return false;
    const identity = epoch.current;
    const petId = snapshot.petId;
    const actionId = retryActionId ?? crypto.randomUUID();
    const now = Date.now();
    const optimistic = (role: 'user' | 'assistant'): ConversationMessage => ({ id: `pending-${actionId}-${role}`,
      sequence: Number.MAX_SAFE_INTEGER, actionId, petId, role, content: role === 'user' ? text : '',
      status: role === 'user' ? 'complete' : 'pending', errorCode: null, model: null, provider: null,
      attempt: 1, createdAt: now, updatedAt: now });
    update({ ...snapshot, messages: retryActionId ? (snapshot.messages ?? []).map(message => message.actionId === actionId && message.role === 'assistant'
      ? { ...message, content: '', status: 'pending', errorCode: null } : message) :
      [...(snapshot.messages ?? []), optimistic('user'), optimistic('assistant')] });
    setError('');
    try {
      if (retryActionId) await request('retry', { petId, actionId }, snapshot);
      else await request('send', { petId, actionId, text }, snapshot);
      if (identity === epoch.current) await reload(current.current?.petId ?? undefined);
      return true;
    } catch (cause) {
      if (!mounted.current || identity !== epoch.current) return true;
      const code = (cause as { code?: string }).code;
      if (current.current?.petId === petId && !['CANCELLED', 'SESSION_CHANGED'].includes(code ?? ''))
        setError(cause instanceof Error ? cause.message : '发送失败，请重试。');
      // Reload restores durable failure/cancellation state, including its retry action.
      await reload(current.current?.petId ?? undefined);
      return !['CONNECTION_REQUIRED', 'KEY_REQUIRED', 'KEY_UNAVAILABLE', 'SECURE_STORAGE_UNAVAILABLE', 'INVALID_INPUT'].includes(code ?? '');
    }
  }, [reload, request, update]);
  const more = useCallback(async () => {
    const snapshot = current.current;
    if (!snapshot?.petId || !snapshot.nextCursor) return;
    const identity = epoch.current;
    const page = await request('history', { petId: snapshot.petId, before: snapshot.nextCursor });
    if (identity !== epoch.current || current.current?.petId !== snapshot.petId) return;
    const latest = current.current;
    const ids = new Set((latest.messages ?? []).map(message => message.id));
    update({ ...latest, messages: [...page.messages.filter(message => !ids.has(message.id)), ...(latest.messages ?? [])], nextCursor: page.nextCursor });
  }, [request, update]);
  const scopedRequest = useCallback(<K extends keyof ConversationCommands>(command: K, payload: ConversationCommands[K]['input']) =>
    request(command, payload, data), [request, data]);
  return { data, error, loading, reload, choose, request: scopedRequest, send, more, setError };
}
