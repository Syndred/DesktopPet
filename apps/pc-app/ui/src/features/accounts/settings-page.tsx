import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import type { SettingsDocument, SettingsSnapshot, AccountsSession } from "../../../../../../packages/shared-types/src/features/accounts";
import { errorText, newActionId, request, useAccountsSession } from "./api";
import { AuthPage } from "./auth";
import { SettingsNavigation } from "./account";

function ToggleRow({ title, description, checked, onChange, children }: { title: string; description?: string; checked: boolean; onChange: (value: boolean) => void; children?: ReactNode }) {
  return <div className="ac-setting-row"><label><span><strong>{title}</strong>{description && <small>{description}</small>}</span>
    <input className="ac-switch" type="checkbox" role="switch" checked={checked} onChange={event => onChange(event.target.checked)} aria-label={title} />
  </label>{children}</div>;
}
function SettingsForm({ privacy = false }: { privacy?: boolean; session: AccountsSession }) {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);
  const [document, setDocument] = useState<SettingsDocument | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    void request<SettingsSnapshot>("settingsGet").then(value => { if (active) { setSnapshot(value); setDocument(value.document); } }).catch(e => { if (active) setError(errorText(e)); });
    return () => { active = false; };
  }, []);
  const edit = <K extends keyof SettingsDocument, P extends keyof SettingsDocument[K]>(section: K, key: P, value: SettingsDocument[K][P]) => {
    setDocument(previous => previous ? { ...previous, [section]: { ...previous[section], [key]: value } } : previous);
    setNotice("");
  };
  async function save(event: FormEvent) {
    event.preventDefault(); if (pending || !snapshot || !document) return;
    setPending(true); setError(""); setNotice("");
    try {
      const saved = await request<SettingsSnapshot>("settingsSave", { document, revision: snapshot.revision, actionId: newActionId() });
      setSnapshot(saved); setDocument(saved.document); setNotice("设置已保存，将在下次启动时恢复。");
    } catch (e) { setError(errorText(e)); }
    finally { setPending(false); }
  }
  return <div className="accounts ac-page"><header className="ac-page-heading"><p className="ac-eyebrow">设置 / {privacy ? "通知与隐私" : "桌面与行为"}</p><h1>{privacy ? "留一点安静，给自己。" : "按你的节奏，安静陪伴。"}</h1><p>自由调整桌面陪伴行为，让可爱的伙伴以你喜欢的方式出现。</p></header>
    <div className="ac-settings-layout"><SettingsNavigation /><form className="ac-settings-content" onSubmit={event => void save(event)}>
      {!document ? <p role="status">正在读取设置…</p> : <fieldset disabled={pending}>
        {!privacy && <section className="ac-card"><h2>桌面表现</h2>
          <ToggleRow title="始终置顶" description="让桌面伙伴始终显示在其他窗口之上。" checked={document.desktop.alwaysOnTop} onChange={v => edit("desktop", "alwaysOnTop", v)} />
          <ToggleRow title="透明区域鼠标穿透" description="透明区域不拦截鼠标，伙伴本体仍可互动。" checked={document.desktop.clickThrough} onChange={v => edit("desktop", "clickThrough", v)} />
          <ToggleRow title="开机启动" description="由你决定是否随系统启动灵境。" checked={document.desktop.launchAtLogin} onChange={v => edit("desktop", "launchAtLogin", v)} />
          <ToggleRow title="关闭窗口后留在托盘" description="关闭主界面时，伙伴仍会在桌面与系统托盘继续陪伴。" checked={document.desktop.closeToTray} onChange={v => edit("desktop", "closeToTray", v)} />
          <div className="ac-setting-row"><label><span><strong>桌面陪伴数量</strong><small>同时在桌面显示的伙伴数量（1–4）。</small></span><select aria-label="桌面陪伴数量" value={document.desktop.companionLimit} onChange={e => edit("desktop", "companionLimit", Number(e.target.value))}>{[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}</select></label></div>
          <ToggleRow title="互动音效" description="伙伴的互动语音与音效音量。" checked={document.desktop.interactionSounds} onChange={v => edit("desktop", "interactionSounds", v)}>
            <label className="ac-volume">音量<input type="range" min={0} max={100} value={document.desktop.volume} onChange={e => edit("desktop", "volume", Number(e.target.value))} /><output>{document.desktop.volume}%</output></label>
          </ToggleRow>
          <ToggleRow title="全屏应用时暂时隐藏" description="进入全屏应用时暂时收起桌面伙伴，结束后恢复。" checked={document.desktop.hideInFullscreen} onChange={v => edit("desktop", "hideInFullscreen", v)} />
        </section>}
        <section className="ac-card"><h2>{privacy ? "通知与安静时段" : "安静时段"}</h2>
          {privacy && <><ToggleRow title="桌面通知" checked={document.notifications.enabled} onChange={v => edit("notifications", "enabled", v)} />
            <ToggleRow title="伙伴互动提醒" checked={document.notifications.companions} onChange={v => edit("notifications", "companions", v)} />
            <ToggleRow title="对战邀请提醒" checked={document.notifications.battles} onChange={v => edit("notifications", "battles", v)} />
            <ToggleRow title="菜园成熟提醒" checked={document.notifications.garden} onChange={v => edit("notifications", "garden", v)} /></>}
          <ToggleRow title="启用安静时段" description="在设定时间内暂停主动通知与互动音效；开始与结束相同表示全天安静。" checked={document.notifications.quietEnabled} onChange={v => edit("notifications", "quietEnabled", v)} />
          <div className="ac-time-range"><label>开始时间<input type="time" value={document.notifications.quietStart} onChange={e => edit("notifications", "quietStart", e.target.value)} required /></label><span>至</span><label>结束时间<input type="time" value={document.notifications.quietEnd} onChange={e => edit("notifications", "quietEnd", e.target.value)} required /></label></div>
        </section>
        <section className="ac-card"><h2>位置与隐私</h2>
          <ToggleRow title="允许附近探索使用位置" description="用于发现附近的地图与同好，首次探索仍需通过系统权限。" checked={document.privacy.locationAllowed} onChange={v => edit("privacy", "locationAllowed", v)} />
          <ToggleRow title="位置仅在探索时更新" description="离开附近探索页面后，停止获取位置。" checked={document.privacy.locationOnlyWhileExploring} onChange={v => edit("privacy", "locationOnlyWhileExploring", v)} />
          <ToggleRow title="情绪统计" description="开启后允许记录互动统计；不读取输入内容。" checked={document.privacy.emotionStatistics} onChange={v => edit("privacy", "emotionStatistics", v)} />
        </section>
        <div className="ac-settings-footer"><button type="button" className="ac-text-button" onClick={() => { void request<SettingsDocument>("settingsDefaults").then(value => { setDocument(value); setNotice("已填入默认设置，保存后生效。"); }).catch(e => setError(errorText(e))); }}>⟳ 恢复默认设置</button><button type="submit" className="ac-primary">{pending ? "正在保存…" : "保存设置"}</button></div>
        {privacy && <button type="button" className="ac-secondary" onClick={() => { void request<{ delivered: boolean; reason?: string }>("testNotification").then(value => setNotice(value.delivered ? "已发送测试通知。" : `当前未发送通知：${value.reason === "quiet-hours" ? "正处于安静时段" : "通知已关闭或系统不支持"}。`)).catch(e => setError(errorText(e))); }}>测试已保存的通知设置</button>}
      </fieldset>}
      <p role="status" aria-live="polite" className="ac-notice">{notice}</p><p role="alert" className="ac-notice ac-error">{error}</p>
    </form></div>
  </div>;
}
export function SettingsPage({ privacy = false }: { privacy?: boolean }) {
  const { session, error, refresh } = useAccountsSession();
  if (error) return <div className="accounts ac-card" role="alert">{error}</div>;
  if (!session) return <div className="accounts ac-loading" role="status">正在核对账号…</div>;
  if (!session.currentUser) return <AuthPage session={session} onSignedIn={refresh} />;
  return <SettingsForm key={session.currentUser.id} privacy={privacy} session={session} />;
}
