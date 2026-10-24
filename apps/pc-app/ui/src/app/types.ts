import type { ComponentType } from 'react';
import type { AppBridge } from '../../../../../packages/shared-types/src/app';

export interface FeatureRoute { path: string; title: string; component: ComponentType<any> }
export interface FeatureModule { id: string; title: string; routes: FeatureRoute[] }
declare global { interface Window { lingjing: AppBridge } }
