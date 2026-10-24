import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, basename } from 'node:path';

const names = ['button','card','dialog','sheet','tabs','select','native-select','switch','tooltip','popover','scroll-area','input','textarea','checkbox','label','badge','separator','slider'];
const records = [];
for (const name of names) {
  const url = `https://ui.shadcn.com/r/styles/radix-nova/${name}.json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const item = await response.json();
  for (const file of item.files || []) {
    if (file.type !== 'registry:ui' || !/^[a-z-]+\.tsx$/.test(basename(file.path))) throw new Error(`Unexpected registry target: ${file.path}`);
    const target = resolve('apps/pc-app/ui/src/components/ui', basename(file.path));
    mkdirSync(resolve('apps/pc-app/ui/src/components/ui'), { recursive: true });
    const icons = new Set();
    let content = file.content.replaceAll('active:not-aria-[haspopup]:translate-y-px', '').replaceAll('active:translate-y-px', '')
      .replaceAll('@/registry/radix-nova/ui/', '@/components/ui/')
      .replace(/import \{ IconPlaceholder \} from "[^\n]+"\n/g, '')
      .replace(/<IconPlaceholder([\s\S]*?)\/>/g, (_full, attributes) => {
        const name = attributes.match(/lucide="([A-Za-z0-9]+)"/)?.[1];
        if (!name) throw new Error(`Missing Lucide icon: ${name}`);
        icons.add(name);
        const props = attributes.replace(/\s*(lucide|tabler|hugeicons|phosphor|remixicon)="[^"]*"/g, '');
        return `<${name}${props}/>`;
      });
    if (icons.size) content = `import { ${[...icons].join(', ')} } from "lucide-react"\n${content.replace('"use client"\n', '')}`;
    content = content.replaceAll('>Close<', '>关闭<');
    if (name === 'slider') content = content.replace('key={index}', 'key={index}\n          aria-label={props["aria-label"]}\n          aria-labelledby={props["aria-labelledby"]}\n          aria-describedby={props["aria-describedby"]}');
    writeFileSync(target, content);
    const modifications = ['Rewrite registry aliases to local components'];
    if (name === 'button') modifications.push('Remove active translation to match approved flat design');
    if (icons.size) modifications.push('Resolve registry icon slots to Lucide and remove redundant client directive');
    if (['dialog','sheet'].includes(name)) modifications.push('Localize close labels to Chinese');
    if (name === 'slider') modifications.push('Forward accessible names and descriptions to focusable thumbs');
    records.push({ name, url, target: `apps/pc-app/ui/src/components/ui/${basename(file.path)}`, sourceSha256: createHash('sha256').update(file.content).digest('hex'), modifications, dependencies: item.dependencies || [], registryDependencies: item.registryDependencies || [] });
  }
}
const license = await fetch('https://raw.githubusercontent.com/shadcn-ui/ui/main/LICENSE.md');
if (!license.ok) throw new Error('Cannot verify shadcn license');
writeFileSync(resolve('apps/pc-app/ui/src/components/ui/LICENSE.shadcn'), await license.text());
writeFileSync(resolve('docs/implementation/shadcn-source-record.json'), JSON.stringify({ importedAt: new Date().toISOString(), library: 'shadcn/ui Radix Nova', license: 'MIT', records }, null, 2));
console.log(`Imported ${records.length} official Radix components.`);
