import type { FeatureModule } from '../../app/types';
import { CompanionsPage } from './CompanionsPage';
import { AdoptionPage } from './AdoptionPage';
import { PetDetailPage } from './PetDetailPage';
import { DesktopCompanion } from './DesktopCompanion';
import './styles.css';

export { CompanionsPage, AdoptionPage, PetDetailPage };
const feature: FeatureModule = { id: 'companions', title: '我的灵宠', routes: [
  { path: '/companions', title: '我的灵宠', component: CompanionsPage },
  { path: '/companions/adopt', title: '领养伙伴', component: AdoptionPage },
  { path: '/companions/:petId', title: '伙伴详情', component: PetDetailPage },
  { path: '/desktop/:petId', title: '桌面伙伴', component: DesktopCompanion }
] };
export default feature;
