import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { AccountUser, AccountsSession, BackupPreview, SettingsSnapshot, SyncStatus } from "../../../../../../packages/shared-types/src/features/accounts";
import { errorText, newActionId, request, useAccountsSession } from "./api";
import { AuthPage } from "./auth";

export function SettingsNavigation() {
  return <nav className="ac-settings-nav" aria-label="设置分类">
    <a href="#/settings">▣ <span>桌面与行为</span></a><a href="#/settings/privacy">♧ <span>通知与隐私</span></a>
    <a href="#/settings/ai">☏ <span>AI 对话</span></a><a href="#/resources">◇ <span>角色资源</span></a>
    <a href="#/account">⟳ <span>账号与同步</span></a>
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
    <header className="ac-page-heading"><p className="ac-eyebrow">设置 / 账号与同步</p><h1>把每一段陪伴，好好保存。</h1><p>在这里管理你的账号资料与数据同步。</p></header>
    <div className="ac-settings-layout"><SettingsNavigation /><div className="ac-account-grid">
      <div className="ac-stack">
        <section className="ac-card"><h2>▤ 账号资料</h2>
          <div className="ac-identity"><span className="ac-avatar" aria-hidden="true">{user.username.slice(0, 1)}</span><div><strong>{user.username}</strong><p>@{user.account} · {user.provider === "runtime" ? "云端账号" : "本机账号"}</p></div></div>
          <form onSubmit={submitProfile}><fieldset disabled={Boolean(pending)}>
            <label>账号<input value={user.account} readOnly aria-readonly="true" /></label>
            <label>用户名<input value={label} onChange={e => setLabel(e.target.value)} minLength={2} maxLength={24} autoComplete="nickname" required /></label>
            {user.provider === "runtime" && <label>当前密码（云端资料验证）<input type="password" value={profilePassword} onChange={e => setProfilePassword(e.target.value)} autoComplete="current-password" minLength={6} required /></label>}
            <button className="ac-primary" type="submit">{pending === "profile" ? "保存中…" : "保存资料"}</button>
          </fieldset></form>
        </section>
        <section className="ac-card"><h2>♙ 修改密码</h2><form onSubmit={submitPassword}><fieldset disabled={Boolean(pending)}>
          <label>当前密码<input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} autoComplete="current-password" minLength={6} maxLength={64} required /></label>
          <label>新密码<input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" minLength={6} maxLength={64} required /></label>
          <label>确认新密码<input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" minLength={6} maxLength={64} required /></label>
          <button className="ac-secondary" type="submit">{pending === "password" ? "保存中…" : "保存密码"}</button>
        </fieldset></form></section>
      </div>
      <div className="ac-stack">
        <section className="ac-card ac-save-card"><h2>☁ 伙伴与记录</h2>
          <div className="ac-save-art" aria-hidden="true"><span>✦</span><i>⟳</i><span>✧</span></div>
          <p>伙伴、养成、聊天与战报，按当前账号独立保存。</p>
          <dl className="ac-facts"><div><dt>云端已核对版本</dt><dd>{sync?.cloudRevision || 0}</dd></div><div><dt>上次同步读回核对</dt><dd>{dateText(sync?.lastVerifiedAt)}</dd></div><div><dt>待处理同步</dt><dd>{sync?.pending || 0} 项</dd></div></dl>
          {sync?.localChanged && <p className="ac-hint">本机有尚未核对到云端的内容。</p>}
          <label className="ac-check"><input type="checkbox" disabled={Boolean(pending) || !settings || user.provider !== "runtime"} checked={settings?.document.sync.enabled || false}
            onChange={event => { const enabled = event.target.checked; void run("sync-preference", async () => {
              if (!settings) return;
              const next = await request<SettingsSnapshot>("settingsSave", { document: { ...settings.document, sync: { enabled } }, revision: settings.revision, actionId: newActionId() });
              setSettings(next); return enabled ? "存档同步已开启。" : "存档同步已关闭，待处理记录已保留。";
            }); }} />开启存档同步</label>
          {user.provider === "local" && <p className="ac-hint">本机账号使用导出与恢复备份；云同步需登录对应云端账号。</p>}
          {sync?.conflicts ? <p className="ac-hint">云端有较新版本，请先预览，再选择如何恢复。</p> : null}
          {sync?.lastError && <p className="ac-hint">上次同步未完成：{sync.lastError}。待同步数据仍在本机。</p>}
          <div className="ac-actions">
            <button className="ac-primary" disabled={Boolean(pending) || !settings?.document.sync.enabled || user.provider !== "runtime"} onClick={() => void run("sync", async () => {
              const result = await request<{ verified?: boolean }>(sync?.pending ? "syncRetry" : "syncNow", { actionId: newActionId() });
              await refresh(); return result.verified ? "同步已完成，并已从云端读回核对。" : "当前没有可重试的同步记录。";
            })}>{pending === "sync" ? "正在同步核对…" : sync?.pending ? "重试同步" : "立即同步"}</button>
            <button className="ac-secondary" disabled={Boolean(pending)} onClick={() => void run("export", async () => {
              const result = await request<{ canceled?: boolean; filePath?: string; excluded?: string[] }>("backupExport");
              return result.canceled ? undefined : `备份已导出：${result.filePath}${result.excluded?.length ? "（安全凭据由系统安全存储单独管理）" : ""}`;
            })}>↓ 导出本地备份</button>
            <button className="ac-secondary" disabled={Boolean(pending)} onClick={() => void run("preview", async () => {
              const result = await request<BackupPreview & { canceled?: boolean }>("backupPreview");
              if (!result.canceled) { setRestoreMode("merge"); setPreview(result); }
            })}>恢复本地备份</button>
            {user.provider === "runtime" && <button className="ac-secondary" disabled={Boolean(pending)} onClick={() => void run("cloud-preview", async () => {
              setPreview(await request<BackupPreview>("cloudPreview")); setRestoreMode("merge");
            })}>预览云端存档</button>}
          </div>
        </section>
        <section className="ac-card"><h2>▣ 当前设备</h2><div className="ac-device"><span aria-hidden="true">▣</span><div><strong>Windows PC</strong><p>{session.persistence === "secure" ? "系统安全存储保持登录" : "仅在本次运行中登录"}</p></div><span className="ac-badge">当前设备</span></div>
          <button className="ac-quiet-button" disabled={Boolean(pending)} onClick={() => void run("logout", async () => { await request("logout"); await refreshSession(); })}>退出登录</button>
        </section>
      </div>
      <div className="ac-feedback"><p role="status" aria-live="polite" className="ac-notice">{notice}</p><p role="alert" className="ac-notice ac-error">{error}</p></div>
    </div></div>
    {preview && <div className="ac-modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="restore-title" className="ac-modal">
      <h2 id="restore-title">预览恢复内容</h2><p>备份时间：{dateText(preview.createdAt)}</p><p>模块：{preview.modules.join("、")}</p>
      <p>{preview.tables.reduce((n, t) => n + t.count, 0)} 条模块记录 · 完整性校验通过</p>
      <label className="ac-check"><input type="radio" name="restore-mode" checked={restoreMode === "merge"} onChange={() => setRestoreMode("merge")} />合并，保留本机现有记录</label>
      <label className="ac-check"><input type="radio" name="restore-mode" checked={restoreMode === "replace"} onChange={() => setRestoreMode("replace")} />恢复到此备份版本</label>
      <p className="ac-hint">恢复前会自动保存当前账号的完整副本。账号资料与登录凭据由当前账号保留。</p>
      <div className="ac-actions"><button className="ac-secondary" disabled={Boolean(pending)} onClick={() => setPreview(null)}>取消</button><button className="ac-primary" disabled={Boolean(pending)} onClick={() => void run("restore", async () => {
        const result = await request<{ preservedBackup: { filePath: string } }>("backupRestore", { previewId: preview.previewId, mode: restoreMode, actionId: newActionId() });
        setPreview(null); await refresh(); return `恢复已完成。恢复前存档保存在：${result.preservedBackup.filePath}`;
      })}>{pending === "restore" ? "正在恢复…" : "确认恢复"}</button></div>
      {error && <p role="alert" className="ac-error">{error}</p>}
    </section></div>}
  </div>;
}

export function AccountPage() {
  const { session, error, refresh } = useAccountsSession();
  if (error) return <div className="accounts ac-card" role="alert">{error}<button className="ac-secondary" onClick={() => void refresh()}>重试</button></div>;
  if (!session) return <div className="accounts ac-loading" role="status">正在核对账号…</div>;
  if (!session.currentUser) return <AuthPage session={session} onSignedIn={refresh} />;
  return <AccountDetails key={session.currentUser.id} user={session.currentUser} session={session} refreshSession={refresh} />;
}
