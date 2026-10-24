import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const uses = {
  electron:'Native sandboxed management/companion windows, tray, DPAPI and Windows host integration',
  'electron-vite':'Electron main/preload/React production build', vite:'Production bundling', typescript:'Typed renderer and preload contracts',
  react:'Modular feature pages and shared component tree', 'react-dom':'React roots and portals',
  shadcn:'Official Radix Nova registry source imported into components/ui; source hashes and MIT notice retained',
  'radix-ui':'Dialog, Select, Tabs, Switch, Slider, Popover, Tooltip, ScrollArea, Checkbox and keyboard/focus behavior',
  tailwindcss:'Shared theme and utility styling', '@tailwindcss/vite':'Official Vite integration in electron.vite.config.ts',
  motion:'Motion for React route/dialog/list transitions and shared live system/app animation policy',
  'pixi.js':'Assets/Spritesheet/AnimatedSprite/Ticker in real 2D resource, desktop and battle stages; garden rendering',
  'lucide-react':'Formal UI action and navigation icons', 'maplibre-gl':'Shared discovery/garden map viewport, tiles, markers, gestures and GeoJSON overlays',
  '@turf/distance':'WGS84 distance validation', '@turf/circle':'Map uncertainty circle', '@turf/boolean-point-in-polygon':'Territory containment', '@turf/helpers':'GeoJSON points and polygons',
  'better-sqlite3':'One Electron SQLite connection, transactional domain persistence and migrations', '@supabase/supabase-js':'Retained multiplayer and reviewed cloud adapters; live backend validation remains separate',
  ai:'Main-process streamText/generateText, provider response parsing, abort and no automatic billable retries',
  '@ai-sdk/openai-compatible':'Configured provider Chat Completions adapter in main', '@assistant-ui/react':'Account/pet-scoped chat composer, messages, IME and scroll behavior over existing IPC store',
  '@electric-sql/pglite':'Development-only embedded PostgreSQL migration/RPC verification; no production service claim'
};
const records = Object.entries(uses).map(([name,usage]) => {
  const data = JSON.parse(readFileSync(resolve('node_modules',name,'package.json'),'utf8'));
  return {name,version:data.version,license:data.license,source:`https://www.npmjs.com/package/${name}/v/${data.version}`,repository:typeof data.repository === 'string' ? data.repository : data.repository?.url,usage};
});
writeFileSync(resolve('docs/implementation/foundation-dependencies.json'),JSON.stringify({verifiedAt:new Date().toISOString(),records,componentSources:'docs/implementation/shadcn-source-record.json',scope:'2D only; archived 3D source and original saves preserved'},null,2)+'\n');
console.log(`Recorded ${records.length} installed versions and actual usage locations.`);
