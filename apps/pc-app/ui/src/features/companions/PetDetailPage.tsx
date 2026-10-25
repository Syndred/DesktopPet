import { useEffect, useState } from 'react';
import { CalendarDays, Heart, MapPin, MessageCircle, Monitor, Shield, Swords, Zap } from 'lucide-react';
import type { CompanionCombatProfile, CompanionPet, CompanionsSnapshot } from '../../../../../../packages/shared-types/src/features/companions';
import { navigate, usePath } from '../../app/navigation';
import { Badge, Button, Card, EmptyState, ErrorNotice, PageHeader } from '../../components/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import roomArtwork from '../../../../runtime/assets/illustrations/companionship-room-v1.png';
import { companionsRequest, useCompanions } from './client';
import { CompanionPortrait } from './CompanionPortrait';
import { ActionPreview } from './ActionPreview';
import { BattleSkillSummary } from '../battle/BattleMoves';
import { hasYuwanRoomArtwork } from './artwork';
import { CompanionElement, DesktopControls, InfoHint, LoadingOrEmpty, PetActions, RenameControl, StateMeters, usePageScroll, type Controller } from './components';

const hasRoomArtwork = (pet: CompanionPet) => hasYuwanRoomArtwork(pet.resource.resourceId);

function OriginMemory({ pet, controller }: { pet: CompanionPet; controller: Controller }) {
  const source = pet.source === 'legacy' ? '往日的陪伴，继续保存在这里。' : pet.source === 'capture' ? '探索途中相遇，从此一起出发。' : '你为它起了名字，一份新的陪伴开始了。';
  const place = typeof pet.origin.locationName === 'string' ? pet.origin.locationName : '';
  const capturedAt = typeof pet.origin.capturedAt === 'string' ? Date.parse(pet.origin.capturedAt) : NaN;
  const meetingDate = new Date(Number.isFinite(capturedAt) ? capturedAt : pet.createdAt).toLocaleDateString('zh-CN');
  return <Card className="cp-origin">
    <div className="cp-origin-heading"><h3>重要的回忆</h3><Button variant="secondary" disabled={controller.busy} onClick={() => controller.petAction('desktop', pet, { visible: !pet.desktop.visible })}><Monitor size={14}/>{pet.desktop.visible ? '收回桌面' : '放到桌面'}</Button></div>
    <div className="cp-origin-memory"><div className={`cp-memory-art ${hasRoomArtwork(pet) ? 'has-scene' : 'cp-lakeside-scene'}`}>
      {hasRoomArtwork(pet) ? <img src={roomArtwork} alt={`${pet.name}的湖畔陪伴插画`}/> : <CompanionPortrait petId={pet.petId} resource={pet.resource} name={pet.name}/>}
    </div><div className="cp-memory-copy"><h4>{pet.source === 'legacy' ? '从前的故事，接着写' : '第一次相遇'}</h4><p>{source}</p><div className="cp-memory-meta">{place && <span><MapPin size={12}/>{place}</span>}<span><CalendarDays size={12}/>{meetingDate}</span></div></div></div>
  </Card>;
}

function useCombatProfile(pet: CompanionPet) {
  const [combat, setCombat] = useState<CompanionCombatProfile | null>(null);
  const [error, setError] = useState('');
  const [request, setRequest] = useState(0);
  useEffect(() => {
    let active = true; setCombat(null); setError('');
    void companionsRequest<CompanionCombatProfile>('combatProfile', { petId: pet.petId }).then(value => { if (active) setCombat(value); }).catch(failure => { if (active) setError(failure instanceof Error ? failure.message : '技能信息暂时无法读取'); });
    return () => { active = false; };
  }, [pet.ownerAccountId, pet.petId, pet.element, pet.growth.level, request]);
  return { combat, error, retry: () => setRequest(value => value + 1) };
}

function GrowthDetail({ pet, controller, combat }: { pet: CompanionPet; controller: Controller; combat: CompanionCombatProfile | null }) {
  const stats = [
    { label: '生命', value: pet.growth.stats.hp, Icon: Heart }, { label: '攻击', value: pet.growth.stats.atk, Icon: Swords },
    { label: '防御', value: pet.growth.stats.def, Icon: Shield }, { label: '速度', value: pet.growth.stats.spd, Icon: Zap }
  ];
  return <><Card className="cp-growth-card"><div className="cp-experience"><strong>Lv.{String(pet.growth.level).padStart(2, '0')}</strong><div><span>{pet.growth.experience} / 100 经验</span><progress max={100} value={pet.growth.experience} aria-label="本级经验"/></div></div>
    <div className="cp-growth-columns"><StateMeters pet={pet} showMax/><div className="cp-battle-stats"><strong className="cp-section-heading">养成属性{combat?.petId === pet.petId && <InfoHint label="对战属性规则" content={`${combat.rules.label}：开场生命 ${combat.rules.maxHp}；养成属性不直接代入。`}/>}</strong>{stats.map(({ label, value, Icon }) => <div key={label}><InfoHint label={`${label} ${value}`} content={`${label} ${value}`}><Icon size={14}/></InfoHint><b>{value}</b></div>)}</div></div>
    <div className="cp-growth-skills"><h3>技能</h3>{combat && <BattleSkillSummary element={pet.element} rules={combat.rules} compact/>}</div>
  </Card><OriginMemory pet={pet} controller={controller}/></>;
}

function PetDetailContent({ pet, snapshot, controller }: { pet: CompanionPet; snapshot: CompanionsSnapshot; controller: Controller }) {
  const [tab, setTab] = useState('growth');
  const { combat, error: combatError, retry } = useCombatProfile(pet);
  const template = snapshot.templates.find(candidate => candidate.templateId === pet.templateId);
  const openChat = async () => { if (await controller.petAction('select', pet, { slot: 'chatPetId' })) navigate('/chat'); };
  const openBattle = async () => { if (await controller.petAction('select', pet, { slot: 'battlePetId' })) navigate('/battle'); };
  return <div className="cp-detail-layout" data-pet-id={pet.petId} data-resource-id={pet.resource.resourceId} data-element={pet.element}><div className="cp-detail-left"><PageHeader back={{ label: '我的灵宠', onClick: () => navigate('/companions') }} eyebrow={pet.name} title="每一份陪伴，都有回应。" description="和你在一起的每一天，都是特别的日常。"/>
    <section className={`cp-detail-hero ${hasRoomArtwork(pet) ? 'cp-detail-room' : 'cp-lakeside-scene'}`} aria-label={`${pet.name}的陪伴场景`}>
      {hasRoomArtwork(pet) ? <img className="cp-detail-scene-art" src={roomArtwork} alt={`${pet.name}在湖畔房间陪伴的插画`}/> : <CompanionPortrait ownerAccountId={pet.ownerAccountId} petId={pet.petId} resource={pet.resource} name={pet.name} animate/>}
      <div className="cp-detail-copy"><h2>{pet.name}<RenameControl pet={pet} controller={controller}/></h2><Badge>Lv.{String(pet.growth.level).padStart(2, '0')} · <CompanionElement element={pet.element}/></Badge><p className="cp-serial">伙伴编号 {pet.serial}</p><div className="cp-detail-badges">{pet.desktop.visible && <Badge><Monitor size={13}/>桌面中</Badge>}{snapshot.selections.battlePetId === pet.petId && <Badge><Swords size={13}/>出战伙伴</Badge>}{snapshot.selections.guardPetId === pet.petId && <Badge><Shield size={13}/>驻守选择</Badge>}</div><p className="cp-detail-personality">{template?.description || '每一份陪伴，都有属于自己的故事。'}</p><PetActions pet={pet} controller={controller}/></div>
    </section></div>
    <div className="cp-detail-body"><ErrorNotice message={combatError}/>{combatError && <Button variant="secondary" onClick={retry}>重新读取技能</Button>}<Tabs value={tab} onValueChange={setTab} className="cp-detail-tab-root"><TabsList className="cp-detail-tabs" aria-label="伙伴详情">{[['growth', '成长'], ['skills', '技能'], ['memory', '回忆'], ['appearance', '外观']].map(([id, text]) => <TabsTrigger key={id} value={id}>{text}</TabsTrigger>)}</TabsList>
      <TabsContent value={tab} className="cp-detail-content">{tab === 'growth' ? <GrowthDetail pet={pet} controller={controller} combat={combat}/> : tab === 'appearance' ? <><Card><div className="cp-section-heading"><h3>桌面陪伴</h3><InfoHint label="桌面拖动说明" content="在桌面拖动伙伴，可分别保存每只的位置与大小。"/></div><DesktopControls pet={pet} controller={controller}/></Card><ActionPreview pet={pet} controller={controller}/></> : tab === 'memory' ? <><OriginMemory pet={pet} controller={controller}/><Card><h3>专属于{pet.name}的回忆</h3><Button disabled={controller.busy} onClick={openChat}><MessageCircle size={17}/>打开它的聊天与记忆</Button></Card></> : <Card><h3>技能</h3><div className="cp-skill-list">{combat ? <BattleSkillSummary element={pet.element} rules={combat.rules}/> : !combatError && <p className="muted" role="status">正在读取技能…</p>}</div><Button variant="secondary" disabled={controller.busy} onClick={openBattle}><Swords size={17}/>前往对战中心</Button></Card>}</TabsContent>
    </Tabs></div>
  </div>;
}

export function PetDetailPage() {
  usePageScroll(); const controller = useCompanions(); const path = usePath(); const petId = path.slice('/companions/'.length);
  const stored = controller.snapshot?.pets.find(candidate => candidate.petId === petId); const pet = stored?.resource.kind === '2d' ? stored : null;
  return <div className="cp-page cp-detail-page"><ErrorNotice message={controller.error}/>{!controller.snapshot ? <LoadingOrEmpty controller={controller}/> : !pet ? <EmptyState title={stored ? '这份旧伙伴记录已保留' : '这只伙伴不在当前账号的灵境里'} action={<Button onClick={() => navigate('/companions')}>回到我的灵宠</Button>}/> : <PetDetailContent key={`${controller.snapshot.ownerAccountId}:${pet.petId}`} pet={pet} snapshot={controller.snapshot} controller={controller}/>}</div>;
}
