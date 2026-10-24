import { Button } from "../../components/ui";
import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { AccountsSession } from "../../../../../../packages/shared-types/src/features/accounts";
import { errorText, request } from "./api";

const rememberedKey = "lingjing_account_hint_v2";
function rememberedAccount() {
  try {
    // Upgrade the old plaintext-password preference to an account hint only.
    const legacy = localStorage.getItem("lingjing_auth_remember_v1");
    if (legacy) {
      try { const data = JSON.parse(legacy); if (typeof data.account === "string") localStorage.setItem(rememberedKey, JSON.stringify({ account: data.account })); }
      finally { localStorage.removeItem("lingjing_auth_remember_v1"); }
    }
    const data = JSON.parse(localStorage.getItem(rememberedKey) || "null");
    return data && typeof data.account === "string" ? data : null;
  } catch { return null; }
}

export function AuthPage({ session, onSignedIn }: { session: AccountsSession; onSignedIn: () => Promise<void> }) {
  const [hint] = useState(rememberedAccount);
  const [register, setRegister] = useState(false);
  const [account, setAccount] = useState(hint?.account || "");
  const [provider, setProvider] = useState<"local" | "runtime">(hint?.provider === "local" ? "local" : session.defaultProvider);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [remember, setRemember] = useState(Boolean(hint));
  const [rememberSession, setRememberSession] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); if (pending) return;
    setPending(true); setError("");
    try {
      if (register && password.trim() !== confirm.trim()) throw new Error("两次输入的密码不一致。");
      await request(register ? "register" : "login", { account, password, username, confirmPassword: confirm, provider, rememberSession });
      try {
        if (remember) localStorage.setItem(rememberedKey, JSON.stringify({ account: account.trim(), provider }));
        else localStorage.removeItem(rememberedKey);
      } catch { /* A storage restriction must not cancel a verified login. */ }
      setPassword(""); setConfirm(""); await onSignedIn();
    } catch (e) { setError(errorText(e)); }
    finally { setPending(false); }
  }
  return <div className="accounts ac-auth">
    <section className="ac-auth-scene" aria-label="灵境陪伴">
      <div className="ac-auth-illustration" aria-hidden="true" />
      <h1>有些陪伴，一直都在。</h1>
      <p>登录，和你的伙伴再次相见。</p>
      <p className="ac-scene-footer">陪伴 · 探索 · 并肩成长</p>
    </section>
    <section className="ac-auth-card">
      <div className="ac-segment" role="group" aria-label="账号操作">
        <Button type="button" aria-pressed={!register} disabled={pending} onClick={() => { setRegister(false); setError(""); }}>登录</Button>
        <Button type="button" aria-pressed={register} disabled={pending} onClick={() => { setRegister(true); setError(""); }}>注册</Button>
      </div>
      <div className="ac-auth-heading"><span aria-hidden="true">✧</span><h2>{register ? "遇见新的陪伴" : "欢迎回来"}</h2><p>{register ? "给自己起个名字，开始你的灵境故事。" : "和伙伴们一起，继续今天的故事吧。"}</p></div>
      <form onSubmit={event => void submit(event)}>
        <fieldset disabled={pending}>
          <label>账号类型<select value={provider} onChange={event => setProvider(event.target.value as "local" | "runtime")}>
            <option value="runtime">云端账号</option><option value="local">本机账号</option>
          </select></label>
          {provider === "local" && <p className="ac-hint">存档保存在这台电脑，可导出备份。旧本机账号可继续登录。</p>}
          {register && <label>用户名<input value={username} onChange={e => setUsername(e.target.value)} autoComplete="nickname" minLength={2} maxLength={24} required /></label>}
          <label>账号<input value={account} onChange={e => setAccount(e.target.value)} autoComplete="username" minLength={3} maxLength={32} required spellCheck={false} /></label>
          <label>密码<div className="ac-password"><input aria-label="密码" type={visible ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} autoComplete={register ? "new-password" : "current-password"} minLength={6} maxLength={64} required /><Button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "隐藏密码" : "显示密码"}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</Button></div></label>
          {register && <label>确认密码<input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" minLength={6} maxLength={64} required /></label>}
          <label className="ac-check"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />记住账号</label>
          <label className="ac-check"><input type="checkbox" checked={rememberSession} disabled={!session.secureStorageAvailable} onChange={e => setRememberSession(e.target.checked)} />保持登录（系统安全存储）</label>
          <div className="ac-notice ac-error" role="alert">{error}</div>
          <Button className="ac-primary ac-submit" type="submit">{pending ? "正在验证…" : register ? "创建账号 →" : "登录进入 →"}</Button>
        </fieldset>
      </form>
      {session.startupIssue && <p className="ac-hint">上次登录需重新验证，请输入账号与密码。</p>}
      {session.migration.unresolved.length > 0 && <p className="ac-hint">已保留旧存档原件；有 {session.migration.unresolved.length} 项历史归属待核对。</p>}
    </section>
  </div>;
}
