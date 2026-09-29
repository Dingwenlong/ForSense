import { _electron as electron } from 'playwright';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..');
await mkdir(path.join(root, 'output/test-data'), { recursive: true });
const work = await mkdtemp(path.join(root, 'output/test-data/finished-preview-'));
const clip = path.join(work, '实况源.mp4');
execFileSync(path.join(root, 'resources/media/ffmpeg.exe'), ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=240x320:rate=30:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', clip], { windowsHide: true });
const env = { ...process.env, SOCIAL_COPY_DATA_DIRECTORY: path.join(work, 'profile') }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath: path.join(root, 'out/SocialCopyStudio-win32-x64/SocialCopyStudio.exe'), env });
const checks = [];
try {
  const page = await app.firstWindow(); page.setDefaultTimeout(30000);
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.webContents.setBackgroundThrottling(false); w.hide(); });
  await page.getByRole('heading', { name: '我的草稿', exact: true }).waitFor();
  const run = (kind, payload) => page.evaluate(({ kind, payload }) => new Promise((resolve, reject) => {
    const id = crypto.randomUUID(); const off = window.desktop.onJob(job => { if (job.id !== id) return; if (job.status === 'done') { off(); resolve(job.result); } else if (job.status === 'error' || job.status === 'cancelled') { off(); reject(new Error(job.error)); } });
    window.desktop.startJob(id, kind, payload).catch(error => { off(); reject(error); });
  }), { kind, payload });
  const images = await run('images', Array.from({ length: 10 }, (_, i) => path.join(root, 'public/ai-examples', i % 2 ? 'food-before.png' : 'product-before.png')));
  const video = await run('video', clip), live = await run('live', { sourceId: video.id, start: 0, end: 0.6, cover: 0.2, mute: true });
  const cases = [
    ['empty', [], ''], ['portrait', [images[0]], '单图，保留完整比例 🌊'], ['landscape', [images[1]], '横图'],
    ['two', images.slice(0, 2), '两张图片'], ['three', images.slice(0, 3), '三张图片'], ['four', images.slice(0, 4), '四张图片'],
    ['nine', images.slice(0, 9), '换行与表情 👨‍👩‍👧‍👦\n' + '海边的慢日子，保留完整文案。'.repeat(80)], ['ten', images, '十张素材'], ['live', [live], '实况'],
  ];
  const drafts = [];
  for (const [name, items, caption] of cases) drafts.push(await page.evaluate(async ({ items, caption }) => { const draft = await window.desktop.createDraft('moments', items.map(i => i.id)); return window.desktop.saveDraft({ ...draft, caption }); }, { items, caption }));
  await page.reload(); await page.getByRole('heading', { name: '我的草稿', exact: true }).waitFor();
  for (let i = 0; i < cases.length; i++) {
    const [name, items] = cases[i], draft = drafts[i];
    await page.locator(`[data-draft-id="${draft.id}"] .library-card-open`).click();
    await page.getByRole('button', { name: '成品预览', exact: true }).click();
    const finished = page.getByRole('region', { name: '微信朋友圈成品预览', exact: true }); await finished.waitFor();
    const buttons = finished.locator('.moments-finished__image'); assert.equal(await buttons.count(), Math.min(9, items.length));
    assert.equal(await finished.locator('textarea, [draggable="true"], .preview-remove').count(), 0);
    if (items.length) await page.waitForFunction(() => [...document.querySelectorAll('.moments-finished__image img')].every(image => image.complete && image.naturalWidth));
    if (items.length === 4) { const positions = await buttons.evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().top)); assert.equal(positions[0], positions[1]); assert.ok(positions[2] > positions[0]); assert.equal(positions[2], positions[3]); }
    if (items.length === 1 && name !== 'live') { const bounds = await buttons.first().boundingBox(); assert.ok(Math.abs(bounds.width / bounds.height - items[0].width / items[0].height) < 0.02); }
    if (name === 'nine') {
      await finished.getByRole('button', { name: '全文', exact: true }).click(); assert.equal(await finished.locator('.moments-finished__caption').innerText(), draft.caption);
      await finished.getByRole('button', { name: '收起', exact: true }).click();
      await page.getByRole('spinbutton', { name: '预览宽度', exact: true }).fill('240'); await page.getByRole('spinbutton', { name: '预览宽度', exact: true }).press('Enter');
      assert.equal(await finished.evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
      await page.getByRole('spinbutton', { name: '预览宽度', exact: true }).fill('520'); await page.getByRole('spinbutton', { name: '预览宽度', exact: true }).press('Enter');
    }
    if (name === 'ten') assert.match(await finished.locator('.moments-finished__overflow').innerText(), /10/);
    await page.screenshot({ path: path.join(work, name + '.png') });
    if (items.length) {
      await buttons.first().click(); const dialog = page.getByRole('dialog', { name: name === 'live' ? '实况预览' : '图片预览', exact: true }); await dialog.waitFor();
      if (name === 'live') await page.waitForFunction(() => document.querySelector('.lightbox video')?.readyState >= 2);
      await dialog.getByRole('button', { name: '返回上一层', exact: true }).click();
    }
    if (name === 'three') { await page.getByRole('button', { name: '导出素材包', exact: true }).click(); await page.getByRole('dialog', { name: '导出发布素材包', exact: true }).getByRole('button', { name: '返回上一层', exact: true }).click(); }
    await page.getByRole('button', { name: '返回编辑', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: '发布文案', exact: true }).inputValue(), draft.caption);
    assert.deepEqual(await page.evaluate(async id => (await window.desktop.listDrafts()).drafts.find(d => d.id === id), draft.id), draft);
    await page.getByRole('button', { name: '返回上一层', exact: true }).click(); checks.push(name); console.log('PASS', name);
  }
  await writeFile(path.join(work, 'verification.json'), JSON.stringify({ version: '0.3.9', cases: checks, draftUnchanged: true }, null, 2));
} finally { await app.close(); console.log('Test materials retained:', work); }
