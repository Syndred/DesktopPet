// Original vector artwork authored for Lingjing. No third-party character or animation is used.
// Run: node generate-fish.cjs [absolute path to a sharp module, if not in node_modules]
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require(process.argv[2] || 'sharp');
const size = 192, columns = 8;
const names = ['idle', 'walk', 'attack', 'hit', 'victory', 'sleep'];
const frame = (row, index) => {
  const phase = index / columns * Math.PI * 2;
  const bob = Math.sin(phase) * (row === 1 ? 7 : 3);
  const squash = row === 3 ? 1 - Math.sin(index / 7 * Math.PI) * 0.14 : 1 + Math.sin(phase) * 0.025;
  const lean = row === 2 ? Math.sin(index / 7 * Math.PI) * -12 : row === 4 ? Math.sin(phase) * 7 : 0;
  const blink = index === 6 || row === 5;
  return `<g transform="translate(${(index % columns) * size} ${row * size})">
    <g transform="translate(96 ${98 + bob}) rotate(${lean}) scale(${squash} ${2 - squash})">
      <path d="M-58 2 Q-94 -39 -77 -3 Q-96 37 -56 17" fill="#a6c9ef" stroke="#6585c5" stroke-width="3"/>
      <path d="M-10 -39 Q10 -74 26 -36" fill="#c0c3f1" stroke="#6585c5" stroke-width="3"/>
      <ellipse cx="0" cy="0" rx="66" ry="48" fill="#a4d6f1" stroke="#6585c5" stroke-width="3"/>
      <ellipse cx="13" cy="15" rx="48" ry="28" fill="#f6faff"/>
      <ellipse cx="-18" cy="-25" rx="25" ry="8" fill="#cce9fa"/>
      <path d="M-27 12 Q-4 2 -16 34 Q-34 29 -27 12" fill="#92b6e7" stroke="#6585c5" stroke-width="2.5"/>
      ${blink ? '<path d="M11 -8 Q18 -2 25 -8 M40 -8 Q47 -2 54 -8" fill="none" stroke="#3c4d7a" stroke-width="4" stroke-linecap="round"/>' : '<ellipse cx="19" cy="-9" rx="6" ry="9" fill="#35466e"/><ellipse cx="47" cy="-9" rx="6" ry="9" fill="#35466e"/><circle cx="21" cy="-12" r="2" fill="white"/><circle cx="49" cy="-12" r="2" fill="white"/>'}
      <ellipse cx="8" cy="4" rx="9" ry="4" fill="#efaabc" opacity=".75"/><ellipse cx="57" cy="4" rx="9" ry="4" fill="#efaabc" opacity=".75"/>
      <path d="M27 7 Q34 16 41 7" fill="none" stroke="#536189" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M-42 -22 Q-45 -13 -42 -9" fill="none" stroke="#78a5d3" stroke-width="2.5"/>
    </g>
    ${row === 2 ? `<path d="M151 ${65 + index * 2} l15 -4 l-5 14 l12 5 l-20 5" fill="#ffd98d" opacity="${Math.sin(index / 7 * Math.PI)}"/>` : ''}
    ${row === 4 ? '<path d="M154 37 l4 8 l8 4 l-8 4 l-4 8 l-4 -8 l-8 -4 l8 -4Z" fill="#ffd78d"/>' : ''}
    ${row === 5 ? '<path d="M149 45 h14 l-14 14 h14" fill="none" stroke="#99a9dc" stroke-width="3" stroke-linejoin="round"/>' : ''}
  </g>`;
};
async function main() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size * columns}" height="${size * names.length}" viewBox="0 0 ${size * columns} ${size * names.length}">${names.flatMap((_, row) => Array.from({ length: columns }, (_, index) => frame(row, index))).join('')}</svg>`;
  const folder = path.join(__dirname, 'fat-fish'); await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, 'fish-source.svg'), svg);
  await sharp(Buffer.from(svg)).png().toFile(path.join(folder, 'fish.png'));
  const clips = Object.fromEntries(names.map((name, row) => [name, { frames: Array.from({ length: columns }, (_, index) => row * columns + index), fps: name === 'sleep' ? 5 : 8, loop: !['attack', 'hit'].includes(name) }]));
  await fs.writeFile(path.join(folder, 'character.json'), JSON.stringify({ format: 'lingjing.character', version: 1, name: '大肥鱼 · 云团', kind: 'spritesheet', image: 'fish.png', sheet: { width: size, height: size, columns, rows: names.length }, clips, actions: { idle: 'idle', walk: 'walk', attack: 'attack', hit: 'hit', skill: null, victory: 'victory', sleep: 'sleep' }, provenance: { author: '灵境项目原创', source: '随附 generate-fish.cjs 生成的原创矢量动画', license: '项目自有素材（未授权单独分发）', attribution: '灵境 · 大肥鱼云团；原始 SVG 和生成代码随资源存档' } }, null, 2) + '\n');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
