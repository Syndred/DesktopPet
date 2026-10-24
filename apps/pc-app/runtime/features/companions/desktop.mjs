const api = window.companionDesktop;
const root = document.getElementById('companion');
const visual = document.getElementById('visual');
const name = document.getElementById('name');
const status = document.getElementById('status');
let renderingKey = '';
let dragging = false;
let rendering = false;
let queued = false;
let cleanup = () => {};
let lastMove = 0;

function resourceError(message) {
  const text = document.createElement('div'); text.className = 'resource-error'; text.textContent = message;
  visual.replaceChildren(text);
}

async function render() {
  if (rendering) { queued = true; return; }
  rendering = true;
  try {
    const result = await api.invoke('snapshot');
    if (!result.ok) { status.textContent = result.message; return; }
    const { pet, resource, modelViewerModule } = result.data;
    document.title = `灵境 · ${pet.name}`;
    name.textContent = pet.name;
    root.dataset.petId = pet.petId;
    root.classList.toggle('sleep', pet.desktop.behavior === 'sleep');
    visual.setAttribute('aria-label', `${pet.name}，${pet.desktop.behavior === 'sleep' ? '休息中' : '桌面陪伴中'}`);
    const key = JSON.stringify(resource);
    if (key === renderingKey) return;
    cleanup(); cleanup = () => {}; renderingKey = key;
    if (!resource) { resourceError('角色资源尚未就绪，请在角色资源库检查。'); return; }
    if ((resource.kind === 'model' || resource.kind === '3d') && resource.url) {
      if (!modelViewerModule) { resourceError('3D 显示组件未就绪'); return; }
      await import(modelViewerModule);
      const model = document.createElement('model-viewer');
      model.setAttribute('src', resource.url); model.setAttribute('autoplay', '');
      model.setAttribute('interaction-prompt', 'none'); model.setAttribute('disable-zoom', '');
      model.setAttribute('environment-image', 'neutral'); model.setAttribute('shadow-intensity', '0');
      if (resource.clip?.name) model.setAttribute('animation-name', resource.clip.name);
      if (resource.calibration) {
        const c = resource.calibration;
        model.setAttribute('orientation', `0deg ${c.pitchDeg}deg ${c.yawDeg}deg`);
        model.style.transform = `translateY(${c.verticalOffset}px) scale(${c.scale * (c.mirrorX ? -1 : 1)}, ${c.scale})`;
      }
      model.setAttribute('alt', pet.name); model.addEventListener('error', () => { status.textContent = '角色模型加载失败，请检查资源文件'; });
      visual.replaceChildren(model);
      return;
    }
    if (resource.url && ['image', '2d'].includes(resource.kind)) {
      const image = document.createElement('img'); image.src = resource.url; image.alt = pet.name;
      image.addEventListener('error', () => { status.textContent = '角色图片加载失败'; }); visual.replaceChildren(image); return;
    }
    if (resource.kind === 'sprite' && resource.frames?.length) {
      const image = document.createElement('img'); image.alt = pet.name; visual.replaceChildren(image);
      let frame = 0;
      const advance = () => { image.src = resource.frames[frame++ % resource.frames.length]; };
      advance(); const timer = setInterval(advance, Math.max(50, 1000 / (resource.fps || 8))); cleanup = () => clearInterval(timer); return;
    }
    if (resource.kind === 'spritesheet' && resource.sheet && resource.url) {
      const canvas = document.createElement('canvas'); const context = canvas.getContext('2d');
      const sheet = resource.sheet; canvas.width = sheet.width; canvas.height = sheet.height;
      canvas.setAttribute('aria-label', pet.name); visual.replaceChildren(canvas);
      if (resource.calibration) {
        const c = resource.calibration;
        canvas.style.transform = `translateY(${c.verticalOffset}px) scale(${c.scale * (c.mirrorX ? -1 : 1)}, ${c.scale})`;
      }
      const image = new Image(); let stopped = false; let frame = 0; let timer;
      const frames = resource.clip?.frames || [0];
      const draw = () => {
        const current = frames[resource.clip?.loop ? frame % frames.length : Math.min(frame, frames.length - 1)];
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, current % sheet.columns * sheet.width, Math.floor(current / sheet.columns) * sheet.height, sheet.width, sheet.height, 0, 0, canvas.width, canvas.height);
        frame += 1;
      };
      image.onload = () => { if (stopped) return; draw(); if (!matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(draw, Math.max(50, 1000 / (resource.clip?.fps || 8))); };
      image.onerror = () => { if (!stopped) status.textContent = '角色图片加载失败'; };
      image.src = resource.url; cleanup = () => { stopped = true; clearInterval(timer); image.onload = null; image.onerror = null; }; return;
    }
    resourceError('资源格式暂不可用，请在角色资源库检查。');
  } catch (error) { status.textContent = `显示失败：${error.message}`; }
  finally { rendering = false; if (queued) { queued = false; void render(); } }
}

let hit = false;
document.addEventListener('pointermove', event => {
  const bounds = visual.getBoundingClientRect();
  const inside = dragging || event.target.closest('button') || (event.clientX > bounds.left + bounds.width * .17 && event.clientX < bounds.right - bounds.width * .17 && event.clientY > bounds.top + bounds.height * .12 && event.clientY < bounds.bottom);
  if (Boolean(inside) !== hit) { hit = Boolean(inside); void api.invoke(hit ? 'hit' : 'miss'); }
  if (dragging && performance.now() - lastMove > 20) { lastMove = performance.now(); void api.invoke('drag-move', { screenX: event.screenX, screenY: event.screenY }); }
});
visual.addEventListener('pointerdown', async event => {
  if (event.button !== 0) return;
  dragging = true; visual.setPointerCapture(event.pointerId); await api.invoke('drag-start', { screenX: event.screenX, screenY: event.screenY });
});
async function endDrag(event) {
  if (!dragging) return;
  dragging = false;
  await api.invoke('drag-move', { screenX: event.screenX, screenY: event.screenY });
  if (visual.hasPointerCapture(event.pointerId)) visual.releasePointerCapture(event.pointerId);
  await api.invoke('drag-end');
}
visual.addEventListener('pointerup', endDrag); visual.addEventListener('pointercancel', endDrag);
document.addEventListener('pointerleave', () => { if (!dragging) { hit = false; void api.invoke('miss'); } });
document.getElementById('touch').addEventListener('click', async () => {
  const result = await api.invoke('interact');
  status.textContent = result.ok ? '感受到你的陪伴啦 ♡' : result.message;
  setTimeout(() => { status.textContent = ''; }, 2800);
});
document.getElementById('recall').addEventListener('click', () => api.invoke('recall'));
api.onChange(render);
window.addEventListener('beforeunload', () => cleanup());
void render();
