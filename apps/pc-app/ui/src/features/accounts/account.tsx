import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Monitor, Bell, MessageCircle, Box, RefreshCw, Cloud, CloudCheck, CloudOff, HardDrive, AlertCircle, FlaskConical, ClipboardPen, LockKeyhole, Download, LogOut } from "lucide-react";
import type { AccountUser, AccountsSession, BackupPreview, SettingsSnapshot, SyncStatus } from "../../../../../../packages/shared-types/src/features/accounts";
import { errorText, newActionId, request, useAccountsSession } from "./api";
import { AuthPage } from "./auth";
import { Button, Card } from "../../components/ui";
import { Input } from "../../components/ui/input";
import { AppDialog } from "../../components/dialog";
import { AccountSelect, AccountSwitch } from "./controls";
import { AnimatedList } from "../../components/motion";
import { usePath } from "../../app/navigation";
import { AccountStatus } from "./status";

export function SettingsNavigation() {
  const path = usePath();
  return <nav className="ac-settings-nav" aria-label="设置分类">
    <a href="#/settings" aria-current={path === "/settings" ? "page" : undefined}><Monitor size={19} /><span>桌面与行为</span></a><a href="#/settings/privacy" aria-current={path === "/settings/privacy" ? "page" : undefined}><Bell size={19} /><span>通知与隐私</span></a>
    <a href="#/settings/ai" aria-current={path === "/settings/ai" ? "page" : undefined}><MessageCircle size={19} /><span>AI 对话</span></a><a href="#/resources" aria-current={path === "/resources" ? "page" : undefined}><Box size={19} /><span>角色资源</span></a>
    <a href="#/account" aria-current={path === "/account" ? "page" : undefined}><RefreshCw size={19} /><span>账号与同步</span></a>
  </nav>;
}
function dateText(value?: string | null) { return value ? new Date(value).toLocaleString("zh-CN") : "尚未完成"; }

function AccountDetails({ user, session, refreshSession }: { user: AccountUser; session: AccountsSession; refreshSession: () => Promise<void> }) {
  const [label, setLabel] = useState(user.username);
  const [profilePassword, setProfilePassword] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [settings, setSettings] = useState<SettingsSnapshot | null>(null);
  const [pending, setPending] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [restoreMode, setRestoreMode] = useState<"merge" | "replace">("merge");
  const previewOpener = useRef<HTMLButtonElement | null>(null);
  const returnPreviewFocus = useRef(false);
  const closePreview = () => { returnPreviewFocus.current = true; setPreview(null); };
  useEffect(() => {
    if (preview || pending || !returnPreviewFocus.current) return;
    returnPreviewFocus.current = false;
    const frame = requestAnimationFrame(() => { if (previewOpener.current?.isConnected) previewOpener.current.focus(); });
    return () => cancelAnimationFrame(frame);
  }, [preview, pending]);
  const refresh = useCallback(async () => {
    const [nextSync, nextSettings] = await Promise.all([request<SyncStatus>("syncStatus"), request<SettingsSnapshot>("settingsGet")]);
    setSync(nextSync); setSettings(nextSettings);
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.all([request<SyncStatus>("syncStatus"), request<SettingsSnapshot>("settingsGet")]).then(([s, prefs]) => {
      if (active) { setSync(s); setSettings(prefs); }
    }).catch(e => { if (active) setError(errorText(e)); });
    return () => { active = false; };
  }, []);
  async function run(name: string, task: () => Promise<string | void>) {
    if (pending) return;
    setPending(name); setNotice(""); setError("");
    try { const text = await task(); if (text) setNotice(text); }
    catch (e) { setError(errorText(e)); }
    finally { setPending(""); }
  }
  function submitProfile(event: FormEvent) {
    event.preventDefault();
    void run("profile", async () => {
      await request("profileSave", { username: label, oldPassword: profilePassword, revision: user.revision });
      setProfilePassword(""); await refreshSession(); return "账号资料已保存。";
    });
  }
  function submitPassword(event: FormEvent) {
    event.preventDefault();
    void run("password", async () => {
      await request("passwordChange", { oldPassword, newPassword, confirmPassword: confirm, revision: user.revision });
      setOldPassword(""); setNewPassword(""); setConfirm(""); await refreshSession(); return "密码已更新。";
    });
  }
  return <div className="accounts ac-page">
    <header className="ac-page-heading"><p className="ac-eyebrow">设置 / 账号与同步</p><div className="ac-title-row"><h1>把每一段陪伴，好好保存。</h1>{session.scenario && <AccountStatus icon={FlaskConical} label="测试场景" detail={`隔离测试 · ${session.scenario.scenarioId}`} iconOnly />}</div></header>
    <div className="ac-settings-layout"><SettingsNavigation /><AnimatedList className="ac-account-grid">
      <div className="ac-stack">
        <Card className="ac-card"><h2><ClipboardPen size={18} />账号资料</h2>
          <div className="ac-identity"><span className="ac-avatar" role="img" aria-label="灵境默认头像" /><div><strong>{user.username}</strong><p>@{user.account} · {user.provider === "runtime" ? "云端账号" : "本机账号"}</p></div></div>
          <form className="ac-profile-form" onSubmit={submitProfile}><fieldset disabled={Boolean(pending)}>
            <label>用户名<Input value={label} onChange={e => setLabel(e.target.value)} minLength={2} maxLength={24} autoComplete="nickname" required /></label>
            {user.provider === "runtime" && <label>当前密码<Input type="password" value={profilePassword} onChange={e => setProfilePassword(e.target.value)} autoComplete="current-password" minLength={6} required /></label>}
            <Button className="ac-primary" type="submit">{pending === "profile" ? "保存中…" : "保存资料"}</Button>
          </fieldset></form>
        </Card>
        <Card className="ac-card"><h2><LockKeyhole size={18} />修改密码</h2><form className="ac-password-form" onSubmit={submitPassword}><fieldset disabled={Boolean(pending)}>
          <label>当前密码<Input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} autoComplete="current-password" minLength={6} maxLength={64} required /></label>
          <label>新密码<Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" minLength={6} maxLength={64} required /></label>
          <label>确认新密码<Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" minLength={6} maxLength={64} required /></label>
          <Button className="ac-secondary" type="submit">{pending === "password" ? "保存中…" : "保存密码"}</Button>
        </fieldset></form></Card>
      </div>
      <div className="ac-stack">
        <Card className="ac-card ac-save-card"><h2><Cloud size={20} />伙伴与记录</h2>
          <div className="ac-save-art ac-save-art-illustrated" aria-hidden="true" />
          <div className="ac-save-status" aria-label="存档状态">
            {user.provider === "local"
              ? <AccountStatus icon={HardDrive} label="本机存档" detail="存档保存在这台电脑，可导出备份。" />
              : <AccountStatus icon={sync?.lastError ? CloudOff : CloudCheck} label={sync?.lastError ? "同步未完成" : sync?.lastVerifiedAt ? "已同步" : "尚未同步"} detail={sync?.lastError ? "暂时无法同步，存档仍保存在本机。" : sync?.lastVerifiedAt ? `上次同步：${dateText(sync.lastVerifiedAt)}` : "本机备份可随时导出。"} tone={sync?.lastError ? "warning" : sync?.lastVerifiedAt ? "success" : "muted"} />}
            {Boolean(sync?.pending) && <AccountStatus icon={RefreshCw} label={`待同步 ${sync?.pending}`} detail="联网后可重试，当前记录仍保存在本机。" />}
            {Boolean(sync?.conflicts) && <AccountStatus icon={AlertCircle} label="版本冲突" detail="先预览云端存档，再决定是否恢复。" tone="warning" />}
          </div>
          {user.provider === "runtime" && <label className="ac-check"><AccountSwitch label="开启存档同步" disabled={Boolean(pending) || !settings} checked={settings?.document.sync.enabled || false}
            onChange={enabled => { void run("sync-preference", async () => {
              if (!settings) return;
              const next = await request<SettingsSnapshot>("settingsSave", { document: { ...settings.document, sync: { enabled } }, revision: settings.revision, actionId: newActionId() });
              setSettings(next); return enabled ? "存档同步已开启。" : "存档同步已关闭，待处理记录已保留。";
            }); }} />开启存档同步</label>
          }
          <div className="ac-actions">
            {user.provider === "runtime" && <Button className="ac-primary" disabled={Boolean(pending) || !settings?.document.sync.enabled} onClick={() => void run("sync", async () => {
              const result = await request<{ verified?: boolean }>(sync?.pending ? "syncRetry" : "syncNow", { actionId: newActionId() });
              await refresh(); return result.verified ? "同步完成。" : "暂无待同步内容。";
            })}>{pending === "sync" ? "同步中…" : sync?.pending ? "重试同步" : "立即同步"}</Button>}
            <Button className="ac-secondary" disabled={Boolean(pending)} onClick={() => void run("export", async () => {
              const result = await request<{ canceled?: boolean; filePath?: string; excluded?: string[] }>("backupExport");
              return result.canceled ? undefined : "备份已导出。";
            })}><Download size={16} />导出本地备份</Button>
            <Button className="ac-secondary" disabled={Boolean(pending)} onClick={event => { previewOpener.current = event.currentTarget; void run("preview", async () => {
              const result = await request<BackupPreview & { canceled?: boolean }>("backupPreview");
              if (!result.canceled) { setRestoreMode("merge"); setPreview(result); }
            }); }}>恢复本地备份</Button>
            {user.provider === "runtime" && <Button className="ac-secondary" disabled={Boolean(pending)} onClick={event => { previewOpener.current = event.currentTarget; void run("cloud-preview", async () => {
              setPreview(await request<BackupPreview>("cloudPreview")); setRestoreMode("merge");
            }); }}>预览云端存档</Button>}
          </div>
        </Card>
        <Card className="ac-card"><h2><Monitor size={19} />当前设备</h2><div className="ac-device"><Monitor size={25} /><div><strong>Windows PC</strong><p>{session.persistence === "secure" ? "已保持登录" : "本次登录"}</p></div></div>
          <Button className="ac-quiet-button" disabled={Boolean(pending)} onClick={() => void run("logout", async () => { await request("logout"); await refreshSession(); })}><LogOut size={16} />退出登录</Button>
        </Card>
      </div>
      <div className="ac-feedback"><p role="status" aria-live="polite" className="ac-notice">{notice}</p><p role="alert" className="ac-notice ac-error">{error}</p></div>
    </AnimatedList></div>
    {preview && <AppDialog title="预览恢复内容" busy={Boolean(pending)} onClose={closePreview}><section className="accounts ac-modal">
      <p>{dateText(preview.createdAt)} · {preview.tables.reduce((n, t) => n + t.count, 0)} 条记录</p>
      <label>恢复方式<AccountSelect label="恢复方式" value={restoreMode} onChange={value => setRestoreMode(value as "merge" | "replace")} disabled={Boolean(pending)} options={[{ value: "merge", label: "合并，保留本机现有记录" }, { value: "replace", label: "恢复到此备份版本" }]} /></label>
      <p className="ac-hint">恢复前会自动备份当前存档；账号资料和登录状态保持不变。</p>
      {restoreMode === "replace" && <p className="ac-error">当前存档将替换为此备份版本。</p>}
      <div className="ac-actions"><Button className="ac-secondary" disabled={Boolean(pending)} onClick={closePreview}>取消</Button><Button className="ac-primary" disabled={Boolean(pending)} onClick={() => void run("restore", async () => {
        const result = await request<{ preservedBackup: { filePath: string } }>("backupRestore", { previewId: preview.previewId, mode: restoreMode, actionId: newActionId() });
        closePreview(); await refresh(); return result.preservedBackup ? "恢复完成，原存档已备份。" : "恢复完成。";
      })}>{pending === "restore" ? "正在恢复…" : "确认恢复"}</Button></div>
      {error && <p role="alert" className="ac-error">{error}</p>}
    </section></AppDialog>}
  </div>;
}

export function AccountPage() {
  const { session, error, refresh } = useAccountsSession();
  const hadVerifiedUser = useRef(false);
  if (session?.currentUser) hadVerifiedUser.current = true;
  if (error) return <div className="accounts ac-card" role="alert">{error}<Button className="ac-secondary" onClick={() => void refresh()}>重试</Button></div>;
  if (!session) return <div className="accounts ac-loading" role="status">正在核对账号…</div>;
  if (!session.currentUser) return hadVerifiedUser.current
    ? <div className="accounts ac-loading" role="status">正在切换账号…</div>
    : <AuthPage session={session} onSignedIn={refresh} />;
  return <AccountDetails key={session.currentUser.id} user={session.currentUser} session={session} refreshSession={refresh} />;
}
