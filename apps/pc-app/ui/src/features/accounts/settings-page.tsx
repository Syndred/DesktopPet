import { Button, Card } from "../../components/ui";
import { useEffect, useRef, useState, type ReactNode, type FormEvent } from "react";
import { desktopPolicyFingerprint } from "../../app/desktop-policy";
import { Monitor, Pointer, RefreshCw, FlaskConical } from "lucide-react";
import { Input } from "../../components/ui/input";
import { AccountSelect, AccountSwitch, AccountSlider } from "./controls";
import type { SettingsDocument, SettingsSnapshot, AccountsSession } from "../../../../../../packages/shared-types/src/features/accounts";
import { errorText, newActionId, request, useAccountsSession } from "./api";
import { AuthPage } from "./auth";
import { SettingsNavigation } from "./account";
import { AccountStatus } from "./status";

const notificationReasonText = new Map<string, string>([
  ["qa-scenario", "当前为演练场景，不发送系统通知"],
  ["unsupported", "当前系统不支持桌面通知"],
  ["signed-out", "请先登录账号"],
  ["disabled", "桌面通知或此类提醒已关闭"],
  ["quiet-hours", "正处于安静时段"],
]);

function ToggleRow({ title, description, checked, onChange, children }: { title: string; description?: string; checked: boolean; onChange: (value: boolean) => void; children?: ReactNode }) {
  return <div className="ac-setting-row"><label><span className="ac-setting-copy"><strong>{title}</strong>{description && <small>{description}</small>}</span>
    <AccountSwitch label={title} checked={checked} onChange={onChange} />
  </label>{children}</div>;
}
function SettingsForm({ privacy = false, session }: { privacy?: boolean; session: AccountsSession }) {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);
  const [document, setDocument] = useState<SettingsDocument | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pointerPreview, setPointerPreview] = useState(false);
  const hostGeneration = useRef(0);
  const owner = session.currentUser?.ownerAccountId || session.currentUser?.id;
  const hostCurrent = snapshot?.host?.ownerAccountId === owner;
  const visibleCount = hostCurrent && Array.isArray(snapshot?.host?.windows) ? snapshot.host.windows.filter(value => value.visible).length : null;
  const appliedLimit = hostCurrent ? snapshot?.host?.companionLimit : null;
  useEffect(() => {
    let active = true, policyKey: string | null = null;
    const refreshHost = async () => {
      const generation = ++hostGeneration.current;
      try {
        const value = await request<SettingsSnapshot>("settingsGet");
        if (!active || generation !== hostGeneration.current) return;
        if (value.host?.ownerAccountId && value.host.ownerAccountId !== owner) return;
        setSnapshot(previous => previous ? { ...previous, host: value.host } : value);
        setDocument(previous => previous || value.document);
      } catch (e) { if (active && generation === hostGeneration.current) setError(errorText(e)); }
    };
    void refreshHost();
    const stopWindows = window.lingjing?.subscribe('companions:windows-changed', value => {
      const who = (value as { ownerAccountId?: string } | null)?.ownerAccountId;
      if (!who || who === owner) void refreshHost();
    });
    const stopPolicy = window.lingjing?.subscribe('accounts:behavior', value => {
      const who = (value as { ownerAccountId?: string } | null)?.ownerAccountId;
      if (who && who !== owner) return;
      const key = desktopPolicyFingerprint(value);
      if (key !== null && key !== policyKey) { policyKey = key; void refreshHost(); }
    });
    return () => { active = false; hostGeneration.current += 1; stopWindows?.(); stopPolicy?.(); };
  }, [owner]);
  const edit = <K extends keyof SettingsDocument, P extends keyof SettingsDocument[K]>(section: K, key: P, value: SettingsDocument[K][P]) => {
    setDocument(previous => previous ? { ...previous, [section]: { ...previous[section], [key]: value } } : previous);
    setNotice("");
  };
  async function save(event: FormEvent) {
    event.preventDefault(); if (pending || !snapshot || !document) return;
    setPending(true); setError(""); setNotice("");
    hostGeneration.current += 1;
    try {
      const saved = await request<SettingsSnapshot>("settingsSave", { document, revision: snapshot.revision, actionId: newActionId() });
      hostGeneration.current += 1; setSnapshot(saved); setDocument(saved.document); setNotice("设置已保存。");
    } catch (e) { setError(errorText(e)); }
    finally { setPending(false); }
  }
  return <div className="accounts ac-page ac-preferences-page">
    <div className="ac-settings-layout"><SettingsNavigation /><div className="ac-settings-body"><header className="ac-page-heading"><div className="ac-title-row"><h1>{privacy ? "留一点安静，给自己。" : "按你的节奏，安静陪伴。"}</h1>{session.scenario && <AccountStatus icon={FlaskConical} label="测试场景" detail={`隔离测试 · ${session.scenario.id}`} iconOnly />}</div></header><form className="ac-settings-content" onSubmit={event => void save(event)}>
      {!document ? <p role="status">正在读取设置…</p> : <fieldset disabled={pending}>
        {!privacy && <div className="ac-desktop-columns"><Card className="ac-card"><h2>桌面表现</h2>
          <ToggleRow title="始终置顶" checked={document.desktop.alwaysOnTop} onChange={v => edit("desktop", "alwaysOnTop", v)} />
          <ToggleRow title="透明区域鼠标穿透" description="透明区域不拦截鼠标，伙伴本体仍可互动。" checked={document.desktop.clickThrough} onChange={v => edit("desktop", "clickThrough", v)} />
          <ToggleRow title="开机启动" checked={document.desktop.launchAtLogin} onChange={v => edit("desktop", "launchAtLogin", v)} />
          <ToggleRow title="关闭窗口后留在托盘" description="关闭主界面时，伙伴仍会在桌面与系统托盘继续陪伴。" checked={document.desktop.closeToTray} onChange={v => edit("desktop", "closeToTray", v)} />
          <div className="ac-setting-row"><label><span><strong>桌面陪伴数量</strong><small>同时在桌面显示的伙伴数量（1–4）。</small></span><AccountSelect label="桌面陪伴数量" value={String(document.desktop.companionLimit)} onChange={value => edit("desktop", "companionLimit", Number(value))} options={[1, 2, 3, 4].map(n => ({ value: String(n), label: String(n) }))} disabled={pending} className="ac-limit-select" /></label></div>
          <ToggleRow title="互动音效" checked={document.desktop.interactionSounds} onChange={v => edit("desktop", "interactionSounds", v)}>
            <label className="ac-volume">音量<AccountSlider value={document.desktop.volume} onChange={value => edit("desktop", "volume", value)} disabled={pending} /><output>{document.desktop.volume}%</output></label>
          </ToggleRow>
          <ToggleRow title="全屏应用时暂时隐藏" checked={document.desktop.hideInFullscreen} onChange={v => edit("desktop", "hideInFullscreen", v)} />
          <ToggleRow title="启用安静时段" checked={document.notifications.quietEnabled} onChange={v => edit("notifications", "quietEnabled", v)}><div className="ac-time-range ac-inline-time"><label>开始时间<Input type="time" value={document.notifications.quietStart} onChange={e => edit("notifications", "quietStart", e.target.value)} required /></label><span>至</span><label>结束时间<Input type="time" value={document.notifications.quietEnd} onChange={e => edit("notifications", "quietEnd", e.target.value)} required /></label></div></ToggleRow>
        </Card><aside className="ac-card ac-desktop-preview"><div className="ac-preview-heading"><h2><Monitor size={18} />桌面预览</h2><Button type="button" className="ac-secondary" aria-pressed={pointerPreview} onClick={() => setPointerPreview(!pointerPreview)}><Pointer size={13} />穿透预览</Button></div><div className={`ac-desktop-scene ${pointerPreview ? "ac-preview-pointer" : ""}`} aria-label="批准的灵境 2D 桌面场景">{pointerPreview && <span className="ac-pointer-hint">{document.desktop.clickThrough ? "透明区域可穿透" : "透明区域接收鼠标"}</span>}</div><div className="ac-preview-caption"><p role="status">当前显示 {visibleCount === null ? '待确认' : `${visibleCount} / ${appliedLimit ?? '待确认'}`}</p><small>统计当前实际显示；等待空位或临时隐藏不会关闭陪伴偏好。{appliedLimit !== null && appliedLimit !== undefined && document.desktop.companionLimit !== appliedLimit ? '新的上限将在保存后生效。' : ''}</small></div></aside></div>}
        {privacy && <Card className="ac-card"><h2>通知与安静时段</h2>
          {privacy && <><ToggleRow title="桌面通知" checked={document.notifications.enabled} onChange={v => edit("notifications", "enabled", v)} />
            <ToggleRow title="伙伴互动提醒" checked={document.notifications.companions} onChange={v => edit("notifications", "companions", v)} />
            <ToggleRow title="对战邀请提醒" checked={document.notifications.battles} onChange={v => edit("notifications", "battles", v)} />
            <ToggleRow title="菜园成熟提醒" checked={document.notifications.garden} onChange={v => edit("notifications", "garden", v)} /></>}
          <ToggleRow title="启用安静时段" description="在设定时间内暂停主动通知与互动音效；开始与结束相同表示全天安静。" checked={document.notifications.quietEnabled} onChange={v => edit("notifications", "quietEnabled", v)} />
          <div className="ac-time-range"><label>开始时间<Input type="time" value={document.notifications.quietStart} onChange={e => edit("notifications", "quietStart", e.target.value)} required /></label><span>至</span><label>结束时间<Input type="time" value={document.notifications.quietEnd} onChange={e => edit("notifications", "quietEnd", e.target.value)} required /></label></div>
        </Card>}
        <Card className="ac-card ac-privacy-card"><h2>位置与隐私</h2>
          <ToggleRow title="允许附近探索使用位置" description="用于附近探索，仍需系统授权。" checked={document.privacy.locationAllowed} onChange={v => edit("privacy", "locationAllowed", v)} />
          <ToggleRow title="位置仅在探索时更新" checked={document.privacy.locationOnlyWhileExploring} onChange={v => edit("privacy", "locationOnlyWhileExploring", v)} />
          <ToggleRow title="情绪统计" description="仅记录互动统计，不读取聊天内容。" checked={document.privacy.emotionStatistics} onChange={v => edit("privacy", "emotionStatistics", v)} />
        </Card>
        <div className="ac-settings-footer"><Button type="button" className="ac-text-button" onClick={() => { void request<SettingsDocument>("settingsDefaults").then(value => { setDocument(value); setNotice("已填入默认设置，保存后生效。"); }).catch(e => setError(errorText(e))); }}><RefreshCw size={16} />恢复默认设置</Button><label className="ac-animation-preference"><AccountSwitch label="界面动效" checked={document.desktop.animationsEnabled} onChange={value => edit("desktop", "animationsEnabled", value)} disabled={pending} />界面动效</label><Button type="submit" className="ac-primary">{pending ? "正在保存…" : "保存设置"}</Button></div>
        {privacy && <Button type="button" className="ac-secondary" onClick={() => { void request<{ delivered: boolean; reason?: string }>("testNotification").then(value => setNotice(value.delivered ? "已发送测试通知。" : `当前未发送通知：${notificationReasonText.get(value.reason || "") || "暂时无法发送，请稍后重试"}。`)).catch(e => setError(errorText(e))); }}>测试已保存的通知设置</Button>}
      </fieldset>}
      <p role="status" aria-live="polite" className="ac-notice">{notice}</p><p role="alert" className="ac-notice ac-error">{error}</p>
    </form></div></div>
  </div>;
}
export function SettingsPage({ privacy = false }: { privacy?: boolean }) {
  const { session, error, refresh } = useAccountsSession();
  if (error) return <div className="accounts ac-card" role="alert">{error}</div>;
  if (!session) return <div className="accounts ac-loading" role="status">正在核对账号…</div>;
  if (!session.currentUser) return <AuthPage session={session} onSignedIn={refresh} />;
  return <SettingsForm key={session.currentUser.ownerAccountId || session.currentUser.id} privacy={privacy} session={session} />;
}
