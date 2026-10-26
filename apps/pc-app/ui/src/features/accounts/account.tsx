import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Monitor, Bell, MessageCircle, Box, RefreshCw, Cloud, CloudCheck, CloudOff, HardDrive, AlertCircle, FlaskConical, ClipboardPen, LockKeyhole, Download, LogOut } from "lucide-react";
import type { AccountUser, AccountsSession, BackupPreview, SettingsSnapshot, SyncStatus } from "../../../../../../packages/shared-types/src/features/accounts";
import { bridge, errorText, newActionId, request, useAccountsSession } from "./api";
import { AuthPage } from "./auth";
import { Button, Card } from "../../components/ui";
import { Input } from "../../components/ui/input";
import { AppDialog } from "../../components/dialog";
import { AccountSelect, AccountSwitch } from "./controls";
import { AnimatedList } from "../../components/motion";
import { usePath } from "../../app/navigation";
import { AccountStatus } from "./status";
import { PreservedRecords } from './preserved-records';

export function SettingsNavigation() {
  const path = usePath();
  return <nav className="ac-settings-nav" aria-label="设置分类">
    <a href="#/settings" aria-current={path === "/settings" ? "page" : undefined}><Monitor size={19} /><span>桌面与行为</span></a><a href="#/settings/privacy" aria-current={path === "/settings/privacy" ? "page" : undefined}><Bell size={19} /><span>通知与隐私</span></a>
    <a href="#/settings/ai" aria-current={path === "/settings/ai" ? "page" : undefined}><MessageCircle size={19} /><span>AI 对话</span></a><a href="#/resources" aria-current={path === "/resources" ? "page" : undefined}><Box size={19} /><span>角色资源</span></a>
    <a href="#/account" aria-current={path === "/account" ? "page" : undefined}><RefreshCw size={19} /><span>账号与云端</span></a>
  </nav>;
}
function dateText(value?: string | null) { return value ? new Date(value).toLocaleString("zh-CN") : "尚未完成"; }

function AccountDetails({ user, session, refreshSession }: { user: AccountUser; session: AccountsSession; refreshSession: () => Promise<void> }) {
  const authoritative = user.authKind === 'supabase';
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
  const [showPreserved, setShowPreserved] = useState(false);
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
    let active = true, generation = 0;
    const reload = () => {
      const current = ++generation;
      void Promise.all([request<SyncStatus>("syncStatus"), request<SettingsSnapshot>("settingsGet")]).then(([s, prefs]) => {
        if (active && current === generation) { setSync(s); setSettings(prefs); }
      }).catch(e => { if (active && current === generation) setError(errorText(e)); });
    };
    reload();
    const disposers = ["accounts:sync-changed", "accounts:settings-changed", "accounts:save-restored"].map(name => bridge()?.subscribe(name, value => {
      const event = value as { ownerAccountId?: string; automatic?: boolean };
      if (!active || event.ownerAccountId !== user.id) return;
      if (event.automatic) { setNotice("已自动同步其他设备的更新。"); setError(""); }
      reload();
    }));
    return () => { active = false; disposers.forEach(dispose => dispose?.()); };
  }, [user.id]);
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
  const localDifferenceDetail = !sync?.lastVerifiedAt ? "本机存档尚未完成云端核对，可预览云端存档或导出备份。"
    : !settings ? "本机存档有待同步差异，请查看同步设置或导出备份。"
    : settings.document.sync.enabled ? "本机有待同步差异，可立即同步或导出备份。"
    : "本机存档有待同步差异，存档同步已关闭。可预览云端存档或导出备份；保留合并后仍可能有差异。";
  return <div className="accounts ac-page">
    <header className="ac-page-heading"><p className="ac-eyebrow">设置 / 账号与云端</p><div className="ac-title-row"><h1>把每一段陪伴，好好保存。</h1>{session.scenario && <AccountStatus icon={FlaskConical} label="测试场景" detail={`隔离测试 · ${session.scenario.id}`} iconOnly />}</div></header>
    <div className="ac-settings-layout"><SettingsNavigation /><AnimatedList className="ac-account-grid">
      <div className="ac-stack">
        <Card className="ac-card"><h2><ClipboardPen size={18} />账号资料</h2>
          <div className="ac-identity"><span className="ac-avatar" role="img" aria-label="灵境默认头像" /><div><strong>{user.username}</strong><p>@{user.account} · {user.provider === "runtime" ? "云端账号" : "本机账号"}</p></div></div>
          <form className="ac-profile-form" onSubmit={submitProfile}><fieldset disabled={Boolean(pending)}>
            <label>用户名<Input value={label} onChange={e => setLabel(e.target.value)} minLength={2} maxLength={24} autoComplete="nickname" required /></label>
            {user.provider === "runtime" && user.authKind!=='supabase' && <label>当前密码<Input type="password" value={profilePassword} onChange={e => setProfilePassword(e.target.value)} autoComplete="current-password" minLength={6} required /></label>}
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
          <div className="ac-save-status" aria-label="存档状态" data-cloud-revision={sync?.cloudRevision} data-local-changed={sync?.localChanged}>
            {user.provider === "local"
              ? <AccountStatus icon={HardDrive} label="本机存档" detail="存档保存在这台电脑，可导出备份。" />
              : authoritative ? <AccountStatus icon={sync?.lastError ? CloudOff : sync?.running ? RefreshCw : CloudCheck}
                label={sync?.running ? '正在读取云端数据' : sync?.lastError ? '暂时离线' : sync?.lastVerifiedAt ? '云端数据已读取' : '等待云端数据'}
                detail={sync?.lastError ? '当前显示已有缓存，联网后会重新读取。' : sync?.lastVerifiedAt ? `最近确认：${dateText(sync.lastVerifiedAt)}` : '伙伴和游戏进度由云端保存；本机保留显示缓存。'}
                tone={sync?.lastError ? 'warning' : sync?.lastVerifiedAt ? 'success' : 'muted'} />
              : <AccountStatus icon={sync?.lastError ? CloudOff : sync?.running ? RefreshCw : sync?.localChanged || sync?.remoteChanged ? Cloud : CloudCheck}
                label={sync?.running ? "正在同步" : sync?.remoteChanged ? "云端有更新" : sync?.lastError ? "同步未完成" : sync?.unverifiedLocal || sync?.privacyRedactions ? "部分内容已同步" : sync?.localChanged || sync?.pending ? "待同步" : sync?.lastVerifiedAt ? sync.lastCloudCheckedAt ? "已同步" : "本机已确认" : "尚未同步"}
                detail={sync?.running ? "正在核对两端存档，本机改动会继续保留。" : sync?.remoteChanged ? "云端有较新存档；本机有改动或待处理记录时，请先预览再决定恢复。" : sync?.lastError ? "暂时无法同步，存档仍保存在本机。" : sync?.localChanged ? localDifferenceDetail : sync?.lastVerifiedAt ? `上次同步：${dateText(sync.lastVerifiedAt)}` : "本机备份可随时导出。"}
                tone={sync?.lastError || sync?.remoteChanged || sync?.unverifiedLocal || sync?.privacyRedactions ? "warning" : sync?.lastVerifiedAt && !sync?.localChanged && !sync?.pending && !sync?.running && sync.lastCloudCheckedAt ? "success" : "muted"} />}
            {Boolean(sync?.pending) && <AccountStatus icon={RefreshCw} label={`待同步 ${sync?.pending}`} detail="联网后可重试，当前记录仍保存在本机。" />}
            {Boolean(sync?.conflicts) && <AccountStatus icon={AlertCircle} label={authoritative ? '个别记录有冲突' : '版本冲突'} detail={authoritative ? '原修改已保留，其他伙伴与游戏功能可继续使用。' : '先预览云端存档，再决定是否恢复。'} tone="warning" />}
            {authoritative && Boolean(sync?.preservedLocalRecords) && <AccountStatus icon={HardDrive} label={`已保留 ${sync?.preservedLocalRecords} 条本机记录`} detail="原内容已单独保留，请逐条选择使用的版本。" />}
            {Boolean(sync?.unverifiedLocal) && <AccountStatus icon={AlertCircle} label="原始进度已保留" detail="本机历史进度仍需核验来源，可同步的内容会独立保存。" tone="warning" />}
            {Boolean(sync?.privacyRedactions) && <AccountStatus icon={LockKeyhole} label="私密字段留在本机" detail="云存档已排除密钥及旧来源原文；本机原件与备份仍保留。" />}
          </div>
          {user.provider === "runtime" && !authoritative && <label className="ac-check"><AccountSwitch label="开启存档同步" disabled={Boolean(pending) || !settings} checked={settings?.document.sync.enabled || false}
            onChange={enabled => { void run("sync-preference", async () => {
              if (!settings) return;
              const next = await request<SettingsSnapshot>("settingsSave", { document: { ...settings.document, sync: { enabled } }, revision: settings.revision, actionId: newActionId() });
              setSettings(next); return enabled ? "存档同步已开启。" : "存档同步已关闭，待处理记录已保留。";
            }); }} />开启存档同步</label>
          }
          <div className="ac-actions">
            {authoritative && Boolean(sync?.preservedLocalRecords) && <Button className="ac-secondary" disabled={Boolean(pending)} onClick={() => setShowPreserved(value => !value)}>{showPreserved ? '收起保留记录' : '查看保留记录'}</Button>}
            {user.provider === "runtime" && <Button className="ac-primary" disabled={Boolean(pending) || sync?.running || !authoritative && !settings?.document.sync.enabled} onClick={() => void run("sync", async () => {
              const result = await request<{ verified?: boolean; personalVerified?: boolean; requiresAuthority?: boolean; privacyRedactions?: boolean }>(sync?.pending ? "syncRetry" : "syncNow", { actionId: newActionId() });
              await refresh(); return authoritative ? result.verified ? '已重新读取云端数据。' : '部分数据暂未读取完成，已有内容仍保留。' : result.privacyRedactions ? "可同步内容已保存，私密字段与原始历史仍在本机保留。" : result.requiresAuthority ? "设置与聊天已同步，本机历史进度等待来源核验。" : result.verified ? "同步完成。" : "暂无待同步内容。";
            })}>{pending === "sync" ? authoritative ? '读取中…' : "同步中…" : authoritative ? '刷新云端数据' : sync?.pending ? "重试同步" : "立即同步"}</Button>}
            <Button className="ac-secondary" disabled={Boolean(pending)} onClick={() => void run("export", async () => {
              const result = await request<{ canceled?: boolean; filePath?: string; excluded?: string[] }>("backupExport");
              return result.canceled ? undefined : "备份已导出。";
            })}><Download size={16} />导出本地备份</Button>
            <Button className="ac-secondary" disabled={Boolean(pending)} onClick={event => { previewOpener.current = event.currentTarget; void run("preview", async () => {
              const result = await request<BackupPreview & { canceled?: boolean }>("backupPreview");
              if (!result.canceled) { setRestoreMode("merge"); setPreview(result); }
            }); }}>{authoritative ? '导入旧备份' : '恢复本地备份'}</Button>
            {user.provider === "runtime" && !authoritative && <Button className="ac-secondary" disabled={Boolean(pending)} onClick={event => { previewOpener.current = event.currentTarget; void run("cloud-preview", async () => {
              setPreview(await request<BackupPreview>("cloudPreview")); setRestoreMode("merge");
            }); }}>预览云端存档</Button>}
          </div>
          {authoritative && showPreserved && <PreservedRecords onChanged={refresh} />}
        </Card>
        <Card className="ac-card"><h2><Monitor size={19} />当前设备</h2><div className="ac-device"><Monitor size={25} /><div><strong>Windows PC</strong><p>{session.persistence === "secure" ? "已保持登录" : "本次登录"}</p></div></div>
          <Button className="ac-quiet-button" disabled={Boolean(pending)} onClick={() => void run("logout", async () => { await request("logout"); await refreshSession(); })}><LogOut size={16} />退出登录</Button>
        </Card>
      </div>
      <div className="ac-feedback"><p role="status" aria-live="polite" className="ac-notice">{notice}</p><p role="alert" className="ac-notice ac-error">{error}</p></div>
    </AnimatedList></div>
    {preview && <AppDialog title="预览恢复内容" busy={Boolean(pending)} onClose={closePreview}><section className="accounts ac-modal">
      <h2>恢复备份</h2><p>{dateText(preview.createdAt)}</p><AccountStatus icon={HardDrive} label={`${preview.modules.length} 项内容`} detail={preview.modules.map(id => ({ settings: "设置", legacy: "历史记录", companions: "伙伴", battle: "战报", garden: "菜园", discovery: "探索", conversations: "聊天", resources: "角色资源" }[id] || "其他数据")).join("、")} />
      {!authoritative && <label>恢复方式<AccountSelect label="恢复方式" value={restoreMode} onChange={value => setRestoreMode(value as "merge" | "replace")} disabled={Boolean(pending)} options={[{ value: "merge", label: "合并，保留本机现有记录" }, { value: "replace", label: "恢复到此备份版本" }]} /></label>}
      <p className="ac-hint">{authoritative ? '导入聊天、角色资源与本机设置。不同版本的记录会单独保留供你选择；云端伙伴、库存与游戏进度使用当前版本。' : '恢复前会自动备份当前存档；账号资料和登录状态保持不变。'}</p>
      {!authoritative && restoreMode === "replace" && <p className="ac-error">当前存档将替换为此备份版本。</p>}
      <div className="ac-actions"><Button className="ac-secondary" disabled={Boolean(pending)} onClick={closePreview}>取消</Button><Button className="ac-primary" disabled={Boolean(pending)} onClick={() => void run("restore", async () => {
        const result = await request<{ preservedBackup: { filePath: string } }>("backupRestore", { previewId: preview.previewId, mode: restoreMode, actionId: newActionId() });
        closePreview(); await refresh(); return authoritative ? '导入完成，原存档已备份；如有不同版本，可逐条查看。' : result.preservedBackup ? "恢复完成，原存档已备份。" : "恢复完成。";
      })}>{pending === "restore" ? authoritative ? '正在导入…' : "正在恢复…" : authoritative ? '确认导入' : "确认恢复"}</Button></div>
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
