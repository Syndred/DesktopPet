import { useEffect, useState, type ReactNode } from "react";
import type { CropId, GardenItem, GardenPet, GardenPlot, GardenTerritory } from "../../../../../../packages/shared-types/src/features/garden";
import { CropArt } from "./art";
import { GardenScene } from './GardenScene';
import { Button } from '../../components/ui/button';
import { Tabs as FilterTabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Input } from '../../components/ui/input';
import { AnimatedList } from '../../components/motion';
import { ShoppingBasket as Basket, Check, Clock3, CookingPot, Flag, Heart, Leaf, Minus, Plus, Sprout, Swords } from 'lucide-react';
import { TerritoryMap } from './TerritoryMap';
import { PetPortrait } from './PetPortrait';
import { useGarden, type GardenState } from "./use-garden";
import "./garden.css";

const go = (path: string) => { window.location.hash = path; };
const cropLabels: Record<CropId, string> = { carrot: "胡萝卜", tomato: "番茄", berry: "莓果", rice: "稻米" };
const formatTime = (milliseconds: number) => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
};
function Tabs({ page }: { page: "territory" | "garden" | "kitchen" | "inventory" }) {
  return <nav className="garden-tabs" aria-label="领地与菜园">
    {([['territory', '/garden', '领地总览'], ['garden', '/garden/plots', '我的菜园'], ['kitchen', '/garden/kitchen', '制作食物'], ['inventory', '/inventory', '背包与喂养']] as const).map(([id, path, label]) => <a href={`#${path}`} key={id} aria-current={id === page ? "page" : undefined}>{label}</a>)}
  </nav>;
}
function Notice({ state }: { state: GardenState }) {
  return <>
    {state.error && <div className="garden-notice garden-notice-error" role="alert"><span>{state.error}</span><Button variant="ghost" type="button" onClick={() => { void state.refresh(); }}>刷新</Button></div>}
    {state.message && <div className="garden-notice" role="status">✓ {state.message}</div>}
    {state.pending && <div className="garden-notice garden-notice-pending"><span>有一笔操作等待确认，重试会沿用原编号。</span><Button variant="ghost" type="button" disabled={state.busy} onClick={() => { void state.retry(); }}>重试原操作</Button></div>}
  </>;
}
function Frame({ state, page, title, subtitle, children, action }: { state: GardenState; page: "territory" | "garden" | "kitchen" | "inventory"; title: string; subtitle: string; children: ReactNode; action?: ReactNode }) {
  return <section className="garden-feature foundation-page" aria-busy={state.busy}>
    <div className="garden-heading"><div><p className="garden-eyebrow">{page === "inventory" ? "背包 / 物品管理" : "领地 / 和伙伴的小天地"}</p><h1 className="font-bold">{title}</h1><p className="garden-subtitle">{subtitle}</p></div><div className="garden-heading-action">{action}</div></div>
    <Tabs page={page} /><Notice state={state} />
    {state.loading ? <div className="garden-empty" role="status">正在打开你的菜园…</div> : !state.snapshot ? <div className="garden-empty"><span className="garden-empty-icon"><Leaf size={38}/></span>{state.errorCode === 'OWNER_MIGRATION_REQUIRED' ? <><h2>旧菜园还在，正在等待存档衔接</h2><p>种植、库存和伙伴的原始记录已保留，归属核对完成后即可继续照料。</p><Button variant="ghost" className="garden-primary" onClick={() => { void state.refresh(); }}>重新检查</Button></> : <><h2>暂时无法打开你的小天地</h2><p>{state.error || '种植、库存和伙伴都跟随当前账号保存。'}</p><Button variant="ghost" className="garden-primary" onClick={() => go('/account')}>查看账号</Button></>}</div> : children}
    {state.snapshot && <p className="garden-save-note">{state.snapshot.sync.mode === "local" ? "本机存档 · 已保存" : state.snapshot.sync.mode === 'cached' ? `本机缓存 · ${state.snapshot.sync.issue || '云端尚未确认'}` : "云端存档 · 已确认"}{state.snapshot.sync.conflicts > 0 && ` · ${state.snapshot.sync.conflicts} 笔同步冲突待处理`}<span>基础菜园随账号保存，领地易主也能继续照料。</span></p>}
  </section>;
}
function PetPicker({ pets, selected, onSelect, disabled }: { pets: GardenPet[]; selected: string; onSelect: (id: string) => void; disabled?: boolean }) {
  return <div className="garden-pet-picker" role="group" aria-label="指定伙伴">
    {pets.length === 0 ? <p className="garden-help">还没有伙伴，先去<a href="#/companions/adopt">领养一只</a>吧。</p> : pets.map(pet => <Button variant="ghost" type="button" key={pet.petId} className={`garden-pet ${selected === pet.petId ? 'is-selected' : ''}`} aria-pressed={selected === pet.petId} onClick={() => onSelect(pet.petId)} disabled={disabled}>
      <span className="garden-pet-portrait" aria-hidden="true"><PetPortrait pet={pet} /><i>{selected === pet.petId ? '✓' : '✧'}</i></span><strong>{pet.name}</strong><small>Lv.{String(pet.growth.level).padStart(2, '0')}</small>
    </Button>)}
  </div>;
}
function Quantity({ value, setValue, max, disabled, label }: { value: number; setValue: (value: number) => void; max: number; disabled: boolean; label: string }) {
  return <div className="garden-quantity" aria-label={label}>
    <Button variant="ghost" type="button" aria-label={`${label}减少`} disabled={disabled || value <= 1} onClick={() => setValue(Math.max(1, value - 1))}><Minus size={14} /></Button>
    <output aria-label={label}>{value}</output>
    <Button variant="ghost" type="button" aria-label={`${label}增加`} disabled={disabled || value >= Math.min(99, max)} onClick={() => setValue(Math.min(99, max, value + 1))}><Plus size={14} /></Button>
  </div>;
}
function PlotCard({ plot, now, selected, select }: { plot: GardenPlot; now: number; selected: boolean; select: () => void }) {
  const mature = Boolean(plot.maturesAt && now >= plot.maturesAt);
  const progress = plot.plantedAt !== null && plot.maturesAt !== null ? Math.min(100, (now - plot.plantedAt) / (plot.maturesAt - plot.plantedAt) * 100) : 0;
  return <Button variant="ghost" type="button" className={`garden-plot ${selected ? 'is-selected' : ''} ${mature ? 'is-mature' : ''}`} aria-pressed={selected} onClick={select} data-plot-id={plot.plotId} aria-label={`地块 ${plot.plotId.split('-')[1]}，${plot.cropType ? cropLabels[plot.cropType] : '空地'}，${mature ? '可收获' : plot.cropType ? '生长中' : '可播种'}`}>
    <span className="garden-plot-label">{plot.cropType ? cropLabels[plot.cropType] : `地块 ${plot.plotId.split('-')[1]}`}</span>
    <span className={`garden-plot-status ${mature ? 'ready' : ''}`}>{mature ? <><Check size={13} />可收获</> : plot.maturesAt ? <><Clock3 size={12} />{formatTime(plot.maturesAt - now)}</> : <><Plus size={13} />播种</>}</span>
    {plot.cropType && !mature && <span className="garden-plot-progress"><i style={{ width: `${Math.max(0, progress)}%` }} /></span>}
  </Button>;
}
export function GardenPage() {
  const state = useGarden();
  const [selectedPlotId, setSelectedPlot] = useState('plot-1');
  const [selectedCrop, setSelectedCrop] = useState<CropId>('carrot');
  const data = state.snapshot;
  const plot = data?.plots.find(p => p.plotId === selectedPlotId);
  const matureIds = data?.plots.filter(p => p.maturesAt !== null && state.now >= p.maturesAt).map(p => p.plotId) || [];
  const crop = data?.crops.find(c => c.id === selectedCrop);
  const seeds = data?.items.find(item => item.id === `seed:${selectedCrop}`)?.quantity || 0;
  const disabled = state.busy || Boolean(state.pending);
  return <Frame state={state} page="garden" title="把小日子，种成好收成。" subtitle="在这里，和伙伴一起，把平凡的日子种出温柔的惊喜。" action={<Button variant="ghost" type="button" className="garden-primary" disabled={disabled || matureIds.length === 0} onClick={() => { void state.mutate('harvest', { plotIds: matureIds }, '成熟作物已放入背包。'); }}><Basket size={17} /> 收获成熟作物{matureIds.length > 0 ? ` · ${matureIds.length}` : ''}</Button>}>
    <div className="garden-layout"><div><div className="garden-world"><GardenScene plots={data?.plots || []} now={state.now} /><div className="garden-world-caption"><span>账号基础菜园</span><small>慢慢长大，好好收获</small></div>{data?.pets[0] && <div className="garden-world-companion" aria-hidden="true"><PetPortrait pet={data.pets[0]} /></div>}<div className="garden-plots">{data?.plots.map(p => <PlotCard key={p.plotId} plot={p} now={state.now} selected={selectedPlotId === p.plotId} select={() => setSelectedPlot(p.plotId)} />)}</div><div className="garden-world-footer">六块小天地，每一份收成都属于你。</div></div>
    <div className="garden-card garden-growth"><h3>作物的成长过程</h3><div>{([['seeds','播种','埋下种子，期待发芽'], ['sprout','生长','离线时也在慢慢长大'], ['tomato','成熟','成熟后会一直等你'], ['carrot','收获入库','直接喂食，或做一碗米饭']] as const).map(([art,label,hint]) => <div key={label}><span className="garden-growth-art"><CropArt crop={art}/></span><strong>{label}</strong><small>{hint}</small></div>)}</div></div></div>
    <aside className="garden-sidebar"><div className="garden-card garden-plot-detail"><p className="garden-eyebrow">正在照料</p><h2>地块 {selectedPlotId.split('-')[1]}{plot?.cropType ? ` · ${cropLabels[plot.cropType]}` : ' · 等你播种'}</h2>
      {plot?.cropType ? <><CropArt crop={plot.cropType} growing={!plot.maturesAt || state.now < plot.maturesAt} /><span className={`garden-pill ${plot.maturesAt && state.now >= plot.maturesAt ? 'green' : ''}`}>{plot.maturesAt && state.now >= plot.maturesAt ? '✓ 已成熟' : `生长中 · ${formatTime((plot.maturesAt || state.now) - state.now)}`}</span><div className="garden-inset"><small>预计收获</small><strong>{cropLabels[plot.cropType]} × {plot.yieldQuantity}</strong></div><Button variant="ghost" className="garden-primary garden-wide" disabled={disabled || !plot.maturesAt || state.now < plot.maturesAt} onClick={() => { void state.mutate('harvest', { plotIds: [plot.plotId] }, `${cropLabels[plot.cropType as CropId]}已放入背包。`); }}><Basket size={16} /> 收获</Button></>
      : <><CropArt crop={selectedCrop} growing /><p className="garden-help">选一包种子，在这里种下新的期待。</p><div className="garden-inset"><small>生长时间 / 成熟收成</small><strong>{Math.round((crop?.growMs || 0) / 60000)} 分钟 · {crop?.yield || 0} 份起</strong></div><Button variant="ghost" className="garden-primary garden-wide" disabled={disabled || seeds < 1} onClick={() => { void state.mutate('plant', { plotId: selectedPlotId, cropType: selectedCrop }, `${cropLabels[selectedCrop]}已播种，会在离线时继续生长。`); }}><Plus size={16} /> 播种{seeds < 1 ? ' · 种子不足' : ''}</Button></>}
    </div><div className="garden-card garden-seed-card"><h3>选择种子 <small>拥有数量</small></h3><div className="garden-seeds">{data?.crops.map(c => <Button variant="ghost" key={c.id} disabled={disabled} type="button" aria-pressed={selectedCrop === c.id} className={selectedCrop === c.id ? 'is-selected' : ''} onClick={() => setSelectedCrop(c.id)}><CropArt crop={c.id} /><strong>{c.name}</strong><small>种子 × {data.items.find(i => i.id === c.seedItemId)?.quantity || 0}</small></Button>)}</div><a className="garden-help garden-link" href="#/discovery">从探索和对战中获得种子 ↗</a></div></aside></div>
  </Frame>;
}
function Feeding({ state, selectedItem, compact = false }: { state: GardenState; selectedItem?: GardenItem; compact?: boolean }) {
  const [petId, setPetId] = useState('');
  const [foodId, setFoodId] = useState('cooked_rice');
  const [count, setCount] = useState(1);
  const data = state.snapshot;
  const item = selectedItem || data?.items.find(i => i.id === foodId);
  const pet = data?.pets.find(p => p.petId === petId);
  const disabled = state.busy || Boolean(state.pending);
  useEffect(() => { setPetId(''); }, [data?.ownerAccountId]);
  useEffect(() => { setCount(1); }, [item?.id]);
  const max = item?.quantity || 0;
  const effectiveCount = Math.max(1, Math.min(count, Math.max(1, max)));
  return <div className={`garden-card garden-feeding ${compact ? 'compact' : ''}`}>{selectedItem && <div className="garden-backpack-food-hero"><CropArt crop={selectedItem.id as CropId | 'cooked_rice'}/><div><h2>{selectedItem.name}</h2><p>{selectedItem.id === 'cooked_rice' ? '粒粒饱满，散发着温暖的香气。亲手做的米饭，是基础也暖心的一餐。' : '来自菜园的新鲜收获，把小小的心意留给伙伴。'}</p><strong><Heart size={14}/> 饱食 +{selectedItem.effects?.satiety || 0}</strong><small>来源：{selectedItem.source}</small></div></div>}<h2 className={selectedItem ? 'garden-pet-question' : undefined}>给哪位伙伴？</h2>{!selectedItem && <p className="garden-help">把亲手种下的喜欢，送给指定的那一只。</p>}<PetPicker pets={data?.pets || []} selected={petId} onSelect={setPetId} disabled={disabled} />
    {!selectedItem && <div className="garden-field"><span id="garden-food-label">选择食物</span><Select value={foodId} onValueChange={setFoodId} disabled={disabled}><SelectTrigger aria-labelledby="garden-food-label" className="garden-food-select"><SelectValue placeholder="选择食物"/></SelectTrigger><SelectContent className="garden-select-popover" position="popper">{data?.items.filter(i => i.effects).map(i => <SelectItem key={i.id} value={i.id}>{i.name} × {i.quantity}</SelectItem>)}</SelectContent></Select></div>}
    {item && <><div className="garden-food-selected"><CropArt crop={item.id as CropId | 'cooked_rice'} /><div><strong>{item.name} × {item.quantity}</strong><small>{item.effects ? `饱食 +${item.effects.satiety} · 心情 +${item.effects.mood} · 亲密 +${item.effects.intimacy}` : item.id === 'rice' ? '稻米需要先制作成米饭' : '种子用来播种'}</small></div></div>
    <div className="garden-row"><span>喂养数量</span><Quantity label="喂养数量" value={effectiveCount} setValue={setCount} max={max} disabled={disabled} /></div>
    <div className="garden-feed-preview"><span>预计饱食变化{pet ? ` · ${pet.name}` : ''}</span><strong>{pet ? `${pet.growth.satiety} → ${Math.min(100, pet.growth.satiety + (item.effects?.satiety || 0) * effectiveCount)}` : '请先选择伙伴'}</strong>{pet && <progress value={Math.min(100, pet.growth.satiety + (item.effects?.satiety || 0) * effectiveCount)} max={100} aria-label="喂食后饱食度" />}</div>
    <Button variant="ghost" className="garden-primary garden-wide" disabled={disabled || !pet || !item.effects || max < effectiveCount} onClick={() => { if (pet && item) void state.mutate('feed', { petId: pet.petId, expectedPetRevision: pet.revision, itemId: item.id, quantity: effectiveCount }, `已给${pet.name}喂食 ${effectiveCount} 份${item.name}。`); }}><Heart size={16} /> {pet ? `喂给${pet.name}` : '选择一只伙伴'}</Button></>}
    <p className="garden-help garden-fineprint">只消耗所选数量，只更新指定伙伴。饱食上限为 100。</p>
  </div>;
}
export function KitchenPage() {
  const state = useGarden(); const [count, setCount] = useState(1);
  const data = state.snapshot;
  const rice = data?.items.find(i => i.id === 'rice')?.quantity || 0;
  const disabled = state.busy || Boolean(state.pending);
  const harvested = data?.ledger.filter(l => l.kind === 'harvest' && l.delta > 0).slice(0, 8) || [];
  return <Frame state={state} page="kitchen" title="这一口，是亲手种下的喜欢。" subtitle="从收获，到制作，再到喂给伙伴，每一口都是特别的心意。">
    <div className="garden-kitchen-layout"><div className="garden-card garden-recent"><h2>最近收获</h2><p className="garden-help">以下作物已经放入背包</p>{harvested.length ? harvested.map(l => <div className="garden-harvest-row" key={l.id}><CropArt crop={l.itemId as CropId} /><div><strong>{cropLabels[l.itemId as CropId]} × {l.delta}</strong><small>{new Date(l.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small><span className="garden-pill green">✓ 已入背包</span></div></div>) : <div className="garden-inline-empty"><span>♧</span><p>收获的喜悦，会留在这里。</p><a href="#/garden/plots">去看看菜园 →</a></div>}</div>
    <div className="garden-card garden-recipe"><h2>制作食物</h2><p className="garden-help">用收获的食材，做一份温暖的米饭。</p><div className="garden-recipe-art"><CropArt crop="cooked_rice" /><h3>热乎乎的米饭</h3><p>软糯香甜的白米饭，是最温暖的味道。</p></div><div className="garden-recipe-flow"><div><CropArt crop="rice" /><strong>稻米 × 1</strong><small>拥有 {rice}</small></div><span>→</span><div><CropArt crop="cooked_rice" /><strong>米饭 × 1</strong><small>制作即入背包</small></div></div><div className="garden-row"><span>制作数量</span><Quantity label="制作数量" value={Math.max(1, Math.min(count, Math.max(1, rice)))} setValue={setCount} max={rice} disabled={disabled} /></div><Button variant="ghost" className="garden-primary garden-wide" disabled={disabled || rice === 0} onClick={() => { void state.mutate('craft', { recipeId: 'cooked_rice', quantity: Math.max(1, Math.min(count, rice)) }, '米饭做好了，已放入背包。'); }}><CookingPot size={16} /> 制作米饭</Button><p className="garden-help garden-fineprint">胡萝卜、番茄和莓果可直接喂食；稻米需先制作。</p></div>
    <Feeding state={state} compact /></div>
  </Frame>;
}
export function InventoryPage() {
  const state = useGarden(); const [category, setCategory] = useState('all'); const [search, setSearch] = useState(''); const [selectedId, setSelectedId] = useState('cooked_rice');
  const data = state.snapshot;
  const items = data?.items.filter(i => (category === 'all' || i.category === category || (category === 'tools' && ['seed','ingredient','tool'].includes(i.category))) && i.name.includes(search.trim())) || [];
  const selected = data?.items.find(i => i.id === selectedId);
  return <Frame state={state} page="inventory" title="把喜欢的，都留给你。" subtitle="这些小小的心意，会变成你们之间更温暖的回忆。" action={<div className="garden-search"><Input type="search" aria-label="搜索物品名称" value={search} placeholder="搜索物品名称…" onChange={e => setSearch(e.target.value)} /><a href="#/garden/plots"><Sprout size={15} /> 去菜园</a></div>}>
    <div className="garden-inventory-layout"><FilterTabs value={category} onValueChange={setCategory}><TabsList className="garden-filters" aria-label="背包分类">{[['all','全部'], ['food','食物'], ['decoration','装扮'], ['tools','道具']].map(([id,label]) => <TabsTrigger key={id} value={id}>{label}</TabsTrigger>)}</TabsList><TabsContent value={category}><AnimatedList className="garden-item-grid">{items.map(item => <Button variant="ghost" type="button" className={`garden-item ${selectedId === item.id ? 'is-selected' : ''}`} key={item.id} aria-pressed={selectedId === item.id} onClick={() => setSelectedId(item.id)}><div className="garden-item-art"><CropArt crop={item.id.replace('seed:', '') as CropId | 'cooked_rice'} />{item.category === 'seed' && <span className="garden-seed-mark">种子</span>}<span className="garden-item-count">{item.quantity}</span></div><strong>{item.name}</strong><span className={`garden-source ${item.category === 'seed' ? 'blue' : ''}`}>{item.source}</span></Button>)}</AnimatedList>{items.length === 0 && <div className="garden-empty">没有找到这个物品，换个名字试试。</div>}</TabsContent></FilterTabs><aside>{selected && !selected.effects ? <div className="garden-card garden-ingredient"><CropArt crop={selected.id.replace('seed:', '') as CropId} /><h2>{selected.name}</h2><p>拥有 {selected.quantity} 份</p><p className="garden-help">{selected.id === 'rice' ? '用稻米制作成米饭，再送给你选中的伙伴。' : '在空菜地种下种子，离线时也会继续生长。'}</p><a className="garden-primary garden-wide" href={selected.id === 'rice' ? '#/garden/kitchen' : '#/garden/plots'}>{selected.id === 'rice' ? '去制作米饭' : '去播种'}</a></div> : <Feeding state={state} selectedItem={selected} />}</aside></div>
  </Frame>;
}
function TerritoryPanel({ territory, state }: { territory: GardenTerritory; state: GardenState }) {
  const [petId, setPetId] = useState(territory.garrisonPetId || ''); const [showLogs, setShowLogs] = useState(false);
  const mine = territory.ownerAccountId === state.snapshot?.ownerAccountId;
  const challenge = state.snapshot?.territoryChallenges?.find(c => c.territoryId === territory.id);
  return <div className="garden-card garden-territory-panel"><span className={`garden-pill ${mine ? 'green' : ''}`}>{mine ? '我的领地' : territory.ownerAccountId ? `${territory.ownerName || '其他玩家'}的领地` : '未占领'}</span><h2><Flag size={19} /> {territory.name}</h2><p className="garden-help">{territory.regionName || '区域信息尚未提供'}</p><div className="garden-inset"><small>区域捕捉收益</small><strong>✧ × {mine ? territory.captureMultiplier : 1}</strong><p className="garden-help">归属与收益沿用当前领地规则。</p></div>{mine && <><h3>驻守伙伴</h3><PetPicker pets={state.snapshot?.pets || []} selected={petId} onSelect={setPetId} disabled={state.busy} /><div className="garden-row"><Button variant="ghost" className="garden-primary" disabled={state.busy || !petId || Boolean(state.pending)} onClick={() => { void state.mutate('garrison', { territoryId: territory.id, petId, expectedTerritoryRevision: territory.revision }, '驻守伙伴已更新。'); }}>确认驻守</Button><Button variant="ghost" className="garden-secondary" disabled={state.busy || !territory.garrisonPetId} onClick={() => { void state.mutate('garrison', { territoryId: territory.id, petId: null, expectedTerritoryRevision: territory.revision }, '伙伴已结束驻守。'); }}>结束驻守</Button></div></>}
  {!mine && !challenge && <><h3>选择出战伙伴</h3><PetPicker pets={state.snapshot?.pets || []} selected={petId} onSelect={setPetId} disabled={state.busy} /><Button variant="ghost" className="garden-primary garden-wide" disabled={state.busy || !petId || Boolean(state.pending) || state.snapshot?.remainingInvasions === 0} onClick={async () => { if (await state.mutate('territoryChallenge', { territoryId: territory.id, expectedTerritoryRevision: territory.revision, petId }, '领地挑战已开始。')) go('/battle'); }}><Swords size={16} /> 发起领地挑战</Button><p className="garden-help garden-fineprint">需要进入该区域；每天两次免费入侵。胜利后确认领地结算。</p></>}
  {challenge && <div className="garden-challenge-pending"><p>这片领地有一场待确认的挑战。</p><a className="garden-secondary garden-wide" href="#/battle">继续对战</a><Button variant="ghost" className="garden-primary garden-wide" disabled={state.busy || Boolean(state.pending)} onClick={() => { void state.mutate('territorySettle', { sessionId: challenge.sessionId }, '领地挑战已结算。'); }}>确认领地结算</Button></div>}
  <Button variant="ghost" className="garden-text-button" onClick={() => setShowLogs(!showLogs)} aria-expanded={showLogs}>占领记录 {showLogs ? '⌃' : '⌄'}</Button>{showLogs && <div className="garden-territory-logs">{territory.logs?.length ? territory.logs.map(log => <p key={log.id}>{log.actorName} · {log.action}<small>{new Date(log.createdAt).toLocaleString('zh-CN')}</small></p>) : <p className="garden-help">暂无可显示的占领记录。</p>}</div>}</div>;
}
export function TerritoryPage() {
  const state = useGarden(); const [selectedId, setSelectedId] = useState('');
  const data = state.snapshot; const territories = data?.territories || [];
  const territory = territories.find(t => t.id === selectedId) || territories[0];
  const mature = data?.plots.filter(p => p.maturesAt && state.now >= p.maturesAt).length || 0;
  return <Frame state={state} page="territory" title="给伙伴，留一片小天地。" subtitle="在真实的风景里，和伙伴一起创造属于你们的角落。" action={<span className="garden-secondary"><Swords size={16} /> 今日可入侵 {data?.remainingInvasions ?? 2} 次</span>}>
    <div className="garden-layout"><div><TerritoryMap territories={territories} owner={data?.ownerAccountId} onLocated={() => state.mutate('territoryLocate', {}, '附近领地已更新。')} /><div className="garden-territory-list">{territories.map(t => <Button variant="ghost" type="button" key={t.id} className={`garden-card ${territory?.id === t.id ? 'is-selected' : ''}`} onClick={() => setSelectedId(t.id)}><span><Flag size={28} /></span><strong>{t.name}</strong><small>{t.ownerAccountId === data?.ownerAccountId ? '我的领地' : t.ownerAccountId ? t.ownerName || '已被占领' : '未占领'}</small><small>区域捕捉收益 × {t.ownerAccountId === data?.ownerAccountId ? t.captureMultiplier : 1}</small></Button>)}</div><div className="garden-card garden-territory-garden"><div><span className="garden-pill green"><Sprout size={13} /> 我的菜园</span><h2>{mature ? `${mature} 块作物成熟了` : '今天，也在慢慢长大。'}</h2><p className="garden-help">不用占领领地，就有属于你的六块基础菜地。</p><a className="garden-primary" href="#/garden/plots">去菜园 {mature ? '收获' : '看看'} →</a></div><CropArt crop="carrot" /><CropArt crop="tomato" /></div></div><aside>{territory ? <TerritoryPanel key={territory.id} territory={territory} state={state} /> : <div className="garden-card garden-inline-empty"><span>✧</span><h2>你的小天地从菜园开始</h2><p>当前没有已同步的领地记录。基础菜园始终可以播种、收获和喂养。</p><a href="#/garden/plots" className="garden-secondary">打开我的菜园</a></div>}<div className="garden-card garden-tip"><span>✦</span><div><strong>驻守与出战分别选择</strong><p>驻守不会改变聊天伙伴或桌面出场。领地易主会保留你的菜园与背包。</p></div></div></aside></div>
  </Frame>;
}
export const feature = { id: 'garden', title: '领地', routes: [
  { path: '/garden', title: '领地总览', component: TerritoryPage },
  { path: '/garden/plots', title: '我的菜园', component: GardenPage },
  { path: '/garden/kitchen', title: '制作与喂食', component: KitchenPage },
  { path: '/inventory', title: '背包与喂养', component: InventoryPage }
] };
export default feature;



