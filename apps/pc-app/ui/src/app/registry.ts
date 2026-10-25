import type { FeatureModule } from './types';
import { lazy } from 'react';
import catalog from 'virtual:lingjing-feature-routes';
const modules = import.meta.glob<{ default?: FeatureModule; feature?: FeatureModule }>('../features/*/index.tsx');
export const routes = catalog.map(route => ({ ...route, component: lazy(async () => {
  const load = modules[`../features/${route.feature}/index.tsx`];
  if (!load) throw new Error('页面模块尚未安装');
  const imported = await load(), feature = imported.default || imported.feature;
  const page = feature?.routes.find(value => value.path === route.path);
  if (!page) throw new Error('页面入口尚未就绪');
  return { default: page.component };
}) }));
export const features: FeatureModule[] = [...new Set(catalog.map(route => route.feature))].map(id => ({ id, title: id, routes: routes.filter(route => route.feature === id) }));
