// 图片：选图 → 压缩 → 存进 IndexedDB → 用 id 引用
import * as store from './store.js';
import { uid } from './util.js';

const MAX_W = 1200;

/** 弹出系统选图（input 隐藏但留在 DOM 里，方便自动化测试定位） */
export function pickImageFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.id = 'jc-file-input';
    input.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(input);

    const done = (file) => {
      input.remove();
      resolve(file ?? null);
    };
    input.addEventListener('change', () => done(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => done(null));
    input.click();
  });
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error || new Error('图片读取失败'));
    fr.readAsDataURL(file);
  });
}

/** 等比缩小并转 jpeg，控制体积（手机照片动辄 3MB，存不下） */
export function shrinkImage(dataUrl, maxW = MAX_W) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / (img.width || maxW));
      const w = Math.max(1, Math.round((img.width || maxW) * scale));
      const h = Math.max(1, Math.round((img.height || maxW) * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.78), w, h });
    };
    img.onerror = () => reject(new Error('这张图片读不了'));
    img.src = dataUrl;
  });
}

/** 选图 → 压缩 → 入库，返回图片 id；取消则返回 null */
export async function addImageFromPicker() {
  const file = await pickImageFile();
  if (!file) return null;
  const raw = await readAsDataUrl(file);
  const shrunk = await shrinkImage(raw);
  const rec = { id: uid(), dataUrl: shrunk.dataUrl, w: shrunk.w, h: shrunk.h, createdAt: Date.now() };
  await store.saveRecord('blobs', rec);
  return rec.id;
}

export function imageById(id) {
  if (!id) return null;
  return store.state.blobs.find((b) => b.id === id) || null;
}

export function imageUrl(id) {
  return imageById(id)?.dataUrl || '';
}

export async function removeImage(id) {
  if (!id) return;
  await store.removeRecord('blobs', id);
}

/** 全屏看大图 */
export function previewImage(id) {
  const img = imageById(id);
  if (!img) return;
  const layer = document.createElement('div');
  layer.className = 'img-preview';
  layer.innerHTML = `<img src="${img.dataUrl}" alt="图片" /><button class="img-close" aria-label="关闭">×</button>`;
  document.body.appendChild(layer);
  const close = () => layer.remove();
  layer.addEventListener('click', close);
  layer.querySelector('.img-close').addEventListener('click', (ev) => { ev.stopPropagation(); close(); });
}
