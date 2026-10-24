import { useState } from 'react';
import { ArrowLeft, MessageCircle, Monitor, Shield, Sparkles, Swords, Zap } from 'lucide-react';
import type { CompanionPet, CompanionsSnapshot } from '../../../../../../packages/shared-types/src/features/companions';
import { navigate, usePath } from '../../app/navigation';
import { Badge, Button, Card, EmptyState, ErrorNotice, PageHeader } from '../../components/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { useCompanions } from './client';
import { CompanionPortrait } from './CompanionPortrait';
import { DesktopControls, elements, LoadingOrEmpty, PetActions, RenameControl, StateMeters, usePageScroll, type Controller } from './components';

function GrowthDetail({ pet }: { pet: CompanionPet }) {
  return <><Card><div className="cp-experience"><strong>Lv.{String(pet.growth.level).padStart(2, '0')}</strong><div><span>{pet.growth.experience} / 100 经验</span><progress max={100} value={pet.growth.experience} aria-label="本级经验"/></div></div><div className="cp-growth-columns"><StateMeters pet={pet}/><div className="cp-battle-stats"><strong>战斗属性</strong>{[['生命', pet.growth.stats.hp], ['攻击', pet.growth.stats.atk], ['防御', pet.growth.stats.def], ['速度', pet.growth.stats.spd]].map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div></div><p className="cp-rule-note">延续现有成长规则：每 100 经验升一级，战斗属性随等级成长。</p></Card><Card className="cp-origin"><h3>属于它的第一次相遇</h3><p>{pet.source === 'legacy' ? '从原有存档来到灵境，往日的陪伴继续保存。' : pet.source === 'capture' ? '探索途中相遇，从此一起出发。' : '你为它起了名字，一份新的陪伴开始了。'}</p><small>{new Date(pet.createdAt).toLocaleDateString('zh-CN')} · 伙伴编号 {pet.serial}</small></Card></>;
}

function PetDetailContent({ pet, snapshot, controller }: { pet: CompanionPet; snapshot: CompanionsSnapshot; controller: Controller }) {
  const [tab, setTab] = useState('growth');
  const openChat = async () => { if (await controller.petAction('select', pet, { slot: 'chatPetId' })) navigate('/chat'); };
  return <div className="cp-detail-layout"><section className="cp-detail-hero"><CompanionPortrait petId={pet.petId} resource={pet.resource} name={pet.name} animate/><div className="cp-detail-copy"><h2>{pet.name}<RenameControl pet={pet} controller={controller}/></h2><Badge>Lv.{String(pet.growth.level).padStart(2, '0')} · {elements[pet.element]}</Badge><p className="cp-serial">伙伴编号 {pet.serial}</p><div className="cp-detail-badges">{pet.desktop.visible && <Badge><Monitor size={13}/>桌面中</Badge>}{snapshot.selections.battlePetId === pet.petId && <Badge><Swords size={13}/>出战伙伴</Badge>}{snapshot.selections.guardPetId === pet.petId && <Badge><Shield size={13}/>驻守选择</Badge>}</div><PetActions pet={pet} controller={controller}/></div></section>
    <div className="cp-detail-body"><Tabs value={tab} onValueChange={setTab}><TabsList className="cp-segmented cp-detail-tabs" aria-label="伙伴详情">{[['growth', '成长'], ['skills', '技能'], ['memory', '回忆'], ['appearance', '外观']].map(([id, text]) => <TabsTrigger key={id} value={id}>{text}</TabsTrigger>)}</TabsList>
      <TabsContent value={tab} className="cp-detail-content">{tab === 'growth' ? <GrowthDetail pet={pet}/> : tab === 'appearance' ? <Card><h3>桌面陪伴</h3><DesktopControls pet={pet} controller={controller}/><p className="muted">在桌面直接拖动这只伙伴即可保存位置。每只伙伴分别记住自己的位置与大小。</p></Card> : tab === 'memory' ? <Card><h3>专属于{pet.name}的回忆</h3><p>和它聊聊今天发生的事。聊天、人设和记忆始终归属这一只伙伴。</p><Button disabled={controller.busy} onClick={openChat}><MessageCircle size={17}/>打开它的聊天与记忆</Button><hr/><p className="muted">相遇来源：{pet.source === 'legacy' ? '原有存档' : pet.source === 'capture' ? '野外收服' : '领养'}</p><small className="cp-mono">{pet.petId}</small></Card> : <Card><h3>与伙伴并肩出战</h3><div className="cp-skill-list">{[
        { title: '普通攻击', description: '基础攻击动作', Icon: Swords }, { title: '元素攻击', description: `${elements[pet.element]}属性的元素攻击`, Icon: Sparkles }, { title: '闪避', description: '使用现有战斗规则判定闪避', Icon: Shield }, { title: '终极技能', description: '怒气满足现有规则时可以使用', Icon: Zap }
      ].map(skill => <div key={skill.title}><skill.Icon size={24}/><div><strong>{skill.title}</strong><p className="muted">{skill.description}</p></div></div>)}</div><Button variant="secondary" onClick={() => navigate('/battle')}><Swords size={17}/>前往对战中心</Button></Card>}</TabsContent>
    </Tabs><Button variant="secondary" className="cp-recall" disabled={controller.busy} onClick={() => controller.petAction('desktop', pet, { visible: !pet.desktop.visible })}><Monitor size={16}/>{pet.desktop.visible ? '收回桌面' : '放到桌面'}</Button></div>
  </div>;
}

export function PetDetailPage() {
  usePageScroll(); const controller = useCompanions(); const path = usePath(); const petId = path.slice('/companions/'.length);
  const stored = controller.snapshot?.pets.find(candidate => candidate.petId === petId); const pet = stored?.resource.kind === '2d' ? stored : null;
  return <div className="cp-page"><Button variant="ghost" className="cp-back" onClick={() => navigate('/companions')}><ArrowLeft size={16}/>我的灵宠</Button><PageHeader eyebrow={`我的灵宠 / ${pet?.name || '伙伴详情'}`} title="每一份陪伴，都有回应。" description="和你在一起的每一天，都是特别的日常。"/><ErrorNotice message={controller.error}/>{!controller.snapshot ? <LoadingOrEmpty controller={controller}/> : !pet ? <EmptyState title={stored ? '这份旧伙伴记录已保留' : '这只伙伴不在当前账号的灵境里'} action={<Button onClick={() => navigate('/companions')}>回到我的灵宠</Button>}/> : <PetDetailContent key={`${controller.snapshot.ownerAccountId}:${pet.petId}`} pet={pet} snapshot={controller.snapshot} controller={controller}/>}</div>;
}
