import { useEffect, useState } from 'react';
import { Button } from '../../components/ui';
import type { AppInfo } from '../../../../../../packages/shared-types/src/ipc';
import { bridge, errorText } from './api';

export function useAppInfo() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const api = bridge();
    if (!api) { setError('请在桌面应用中查看真实版本。'); return; }
    void api.invoke<AppInfo>('app', 'info').then(result => {
      if (!active) return;
      if (result.ok) setInfo(result.data); else setError(result.message);
    }).catch(cause => { if (active) setError(errorText(cause)); });
    return () => { active = false; };
  }, []);
  return { info, error };
}
export function AppVersion() {
  const { info, error } = useAppInfo();
  return <p className="ac-hint" aria-label="应用版本">{info ? `灵境 ${info.version} · ${info.build?.sourceCommit?.slice(0, 12) || '构建标识未提供'}` : error || '正在读取版本…'} · <a href="#/settings/about">关于与诊断</a></p>;
}
export function AboutPage() {
  const { info, error } = useAppInfo();
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  async function open(command: 'openLogs' | 'showExecutable') {
    setBusy(true); setActionError('');
    try { const api = bridge(); if (!api) throw Error('请在桌面应用中打开。'); const result = await api.invoke('app', command); if (!result.ok) throw Error(result.message); }
    catch (cause) { setActionError(errorText(cause)); } finally { setBusy(false); }
  }
  return <main className="ac-page"><a href="#/settings">← 返回设置</a><h1>关于与本地诊断</h1>
    {(error || actionError) && <p role="alert">{error || actionError}</p>}
    {!info ? <p role="status">{error ? '版本信息尚未读取，不能据此判断安装包版本。' : '正在读取运行信息…'}</p> : <>
      <h2>灵境 {info.version}</h2><dl>
        <dt>源码版本</dt><dd>{info.build?.sourceCommit || '本版本未提供构建清单'}</dd>
        <dt>构建时间</dt><dd>{typeof info.build?.builtAt === 'string' ? info.build.builtAt : '未提供'}</dd>
        <dt>源码工作区</dt><dd>{Array.isArray(info.build?.sourceDirtyFiles) ? info.build.sourceDirtyFiles.length ? '构建时包含未提交变更，请同时核对源码指纹' : '构建时工作区干净' : '未提供'}</dd>
        <dt>源码指纹</dt><dd style={{ overflowWrap: 'anywhere' }}>{info.build?.codeFingerprint || '未提供'}</dd>
        <dt>编译指纹</dt><dd style={{ overflowWrap: 'anywhere' }}>{info.build?.compiledFingerprint || '未提供'}</dd>
        <dt>运行环境</dt><dd>{info.platform} / {info.runtime.arch} · Electron {info.runtime.electron} · Node {info.runtime.node}</dd>
        <dt>程序位置</dt><dd style={{ overflowWrap: 'anywhere' }}>{info.support?.executablePath || '稳定程序位置不可用（可能是开发模式或临时解压进程）'}</dd>
        <dt>本地日志目录</dt><dd style={{ overflowWrap: 'anywhere' }}>{info.support?.logsPath || '未提供'}</dd>
      </dl>
      <Button disabled={busy || !info.support?.executablePath} onClick={() => void open('showExecutable')}>显示程序文件</Button>{' '}
      <Button disabled={busy || !info.support?.logsAvailable} onClick={() => void open('openLogs')}>打开本地日志目录</Button>
      <p>诊断信息只在本机显示，不自动上传。{!info.support?.logsAvailable && ' 当前尚无本地日志目录；不代表没有错误。'}日志目录可能为空，当前未承诺持续日志采集。分享截图或日志前请检查个人路径与敏感内容。</p>
    </>}
    <h2>手动更新便携版</h2>
    <p>当前没有配置官方下载地址或自动更新服务。</p>
    <ol><li>在账号页面导出备份并妥善保存；不要删除用户数据目录。</li><li>取得可信来源的新版本后，从托盘彻底退出灵境。</li><li>保留旧 EXE 以便回退，在稳定程序位置替换或放置新的便携版 EXE。不要替换临时解压目录中的内部程序。</li><li>启动新版，核对这里的版本、构建标识及原有数据；异常时先停止操作并保留备份。</li></ol>
  </main>;
}
