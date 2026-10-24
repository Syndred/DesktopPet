import type { FeatureModule } from './types';
const modules = import.meta.glob('../features/*/index.tsx', { eager: true }) as Record<string, { default?: FeatureModule; feature?: FeatureModule }>;
export const features: FeatureModule[] = Object.values(modules).map(m => m.default || m.feature).filter((f): f is FeatureModule => Boolean(f?.id && Array.isArray(f.routes)));
export const routes = features.flatMap(f => f.routes);
