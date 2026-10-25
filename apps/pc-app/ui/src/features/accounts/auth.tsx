import { Button } from "../../components/ui";
import { useState, type FormEvent } from "react";
import { Eye, EyeOff, HardDrive, FlaskConical, LockKeyhole } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Input } from "../../components/ui/input";
import { AccountSelect, AccountCheckbox } from "./controls";
import type { AccountsSession } from "../../../../../../packages/shared-types/src/features/accounts";
import { errorText, request } from "./api";
import { AccountStatus } from "./status";

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
    <Tabs className="ac-auth-card" value={register ? "register" : "login"} onValueChange={value => { setRegister(value === "register"); setError(""); }}>
      <TabsList className="ac-segment" aria-label="账号操作">
        <TabsTrigger value="login" disabled={pending}>登录</TabsTrigger>
        <TabsTrigger value="register" disabled={pending}>注册</TabsTrigger>
      </TabsList>
      <TabsContent value={register ? "register" : "login"} forceMount>
      <div className="ac-auth-heading"><img className="ac-auth-mark" src="./brand/logo-mark.png" alt="" /><h2>{register ? "遇见新的陪伴" : "欢迎回来"}</h2>{session.scenario && <AccountStatus icon={FlaskConical} label="测试场景" detail={`隔离测试 · ${session.scenario.id}`} iconOnly />}</div>
      <form onSubmit={event => void submit(event)}>
        <fieldset disabled={pending}>
          <label><span className="ac-field-caption">账号类型{provider === "local" && <AccountStatus icon={HardDrive} label="本机存档" detail="仅保存在这台电脑，可导出备份。" iconOnly />}</span><AccountSelect label="账号类型" value={provider} onChange={value => setProvider(value as "local" | "runtime")} disabled={pending} options={session.scenario ? [{ value: "local", label: "本机账号" }] : [{ value: "runtime", label: "云端账号" }, { value: "local", label: "本机账号" }]} /></label>
          {register && <label>用户名<Input value={username} onChange={e => setUsername(e.target.value)} autoComplete="nickname" minLength={2} maxLength={24} required /></label>}
          <label>账号<Input value={account} onChange={e => setAccount(e.target.value)} autoComplete="username" minLength={3} maxLength={32} required spellCheck={false} /></label>
          <label>密码<div className="ac-password"><Input aria-label="密码" type={visible ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} autoComplete={register ? "new-password" : "current-password"} minLength={6} maxLength={64} required /><Button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "隐藏密码" : "显示密码"}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</Button></div></label>
          {register && <label>确认密码<Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" minLength={6} maxLength={64} required /></label>}
          <div className="ac-auth-preferences">
            <label className="ac-check"><AccountCheckbox label="记住账号" checked={remember} onChange={setRemember} disabled={pending} /><span>记住账号</span></label>
            <div className="ac-login-preference"><label className="ac-check"><AccountCheckbox label="保持登录" checked={rememberSession} disabled={!session.secureStorageAvailable || pending} onChange={setRememberSession} /><span>保持登录</span></label><AccountStatus icon={LockKeyhole} label="登录保护" detail={session.scenario ? "测试场景仅在本次运行中登录。" : session.secureStorageAvailable ? "在这台电脑上保持登录，密码不会保存在页面中。" : "此设备暂不支持保持登录。"} iconOnly /></div>
          </div>
          <div className="ac-notice ac-error" role="alert">{error}</div>
          <Button className="ac-primary ac-submit" type="submit">{pending ? "正在验证…" : register ? "创建账号 →" : "登录进入 →"}</Button>
        </fieldset>
      </form>
      {session.startupIssue && <p className="ac-hint">请重新登录。</p>}
      {session.migration.unresolved.length > 0 && <p className="ac-hint">有 {session.migration.unresolved.length} 项旧记录待核对，原件已保留。</p>}
      </TabsContent>
    </Tabs>
  </div>;
}
