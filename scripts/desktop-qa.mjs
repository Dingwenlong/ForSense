import { _electron as electron } from 'playwright';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const executable = process.env.SOCIAL_COPY_QA_EXECUTABLE || path.join(root, 'out/SocialCopyStudio-win32-x64/SocialCopyStudio.exe');
const work = await mkdtemp(path.join(os.tmpdir(), 'social-copy-desktop-qa-'));
const output = path.join(root, 'output/playwright'); await mkdir(output, { recursive: true });
const ffmpeg = path.join(root, 'resources/media/ffmpeg.exe');
const assertions = [], errors = [];
let application, page;
const record = message => { assertions.push(message); console.log('PASS', message); };
const waitFor = async callback => { const start = Date.now(); while (Date.now() - start < 60000) { if (await callback()) return; await new Promise(resolve => setTimeout(resolve, 150)); } throw new Error('Timed out waiting for application condition'); };
const env = { ...process.env, SOCIAL_COPY_DATA_DIRECTORY: path.join(work, 'profile') };
// The packaged app must find its own media tools. This child PATH deliberately excludes development tools.
env.PATH = `${process.env.SystemRoot}\\system32;${process.env.SystemRoot}`;
delete env.ELECTRON_RUN_AS_NODE;
async function launch() {
  application = await electron.launch({ executablePath: executable, env, timeout: 30000 });
  page = await application.firstWindow(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('textbox', { name: '草稿标题', exact: true }).waitFor();
}
async function selectFiles(paths) {
  await application.evaluate(({ dialog }, files) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files }); }, paths);
}
const cards = () => page.locator('.asset-card');
try {
  const images = [];
  for (let i = 0; i < 3; i++) {
    const file = path.join(work, `风景 ${i + 1}.png`);
    const colors = [['#9ebdc5', '#578e92', '#e0d2b6'], ['#bec6a4', '#597458', '#b3ad83'], ['#b9b7ad', '#6f8b90', '#e6c7ad']][i];
    execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', `color=c=${colors[0]}:s=900x1200:d=0.1`, '-vf', `drawbox=x=0:y=550:w=900:h=650:color=${colors[1]}:t=fill,drawbox=x=0:y=920:w=900:h=280:color=${colors[2]}:t=fill,drawbox=x=130:y=250:w=80:h=80:color=#f4e9ca:t=fill`, '-frames:v', '1', '-update', '1', file], { windowsHide: true }); images.push(file);
  }
  const inputVideo = path.join(work, '短视频.mp4');
  execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=30:duration=1.2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', inputVideo], { windowsHide: true });
  await launch(); record('Packaged executable opens with no Node/FFmpeg in PATH');
  assert.equal(await page.locator('.phone-preview, .phone-status, .home-indicator, .douyin-actions').count(), 0);
  await page.getByRole('heading', { name: '图文排版预览', exact: true }).waitFor();
  record('Preview presents a plain layout without phone chrome or simulated social actions');
  await page.screenshot({ path: path.join(output, '01-workspace-empty.png') });
  const title = page.getByRole('textbox', { name: '草稿标题', exact: true });
  await title.fill('海边的慢日子');
  const caption = '把时间留给风，把心情留给海。\n\n走走停停，收集一些简单的快乐。🌊\n#周末日常 #慢生活';
  await page.getByRole('textbox', { name: '发布文案', exact: true }).fill(caption);
  await selectFiles(images);
  await page.getByRole('button', { name: '添加图片', exact: true }).click();
  await waitFor(async () => await cards().count() === 3);
  assert.equal(await page.locator('.preview-image').count(), 3); record('Native file selection imports images and updates Moments preview');
  const firstSource = await cards().first().locator('img').getAttribute('src');
  await page.getByRole('button', { name: '后移第 1 张', exact: true }).click();
  assert.notEqual(await cards().first().locator('img').getAttribute('src'), firstSource); record('Keyboard-accessible reordering changes material order');
  await page.getByRole('button', { name: '编辑第 1 张图片', exact: true }).click();
  await page.getByRole('button', { name: '1:1', exact: true }).click();
  await page.getByRole('button', { name: '应用调整', exact: true }).click();
  await page.getByRole('dialog', { name: '调整画面' }).waitFor({ state: 'hidden' });
  assert.match(await cards().first().innerText(), /900 × 900/); record('Crop editor applies dimensions to preview and stored rendition');
  await page.getByRole('button', { name: '复制文案', exact: true }).click();
  await page.getByText('文案已复制，可粘贴到发布页面', { exact: true }).waitFor();
  assert.equal(await application.evaluate(({ clipboard }) => clipboard.readText()), caption); record('Copy caption preserves Unicode and line breaks');
  await page.screenshot({ path: path.join(output, '02-moments-editor.png') });
  await page.locator('.platform-choice').getByRole('button', { name: '抖音图文', exact: true }).click();
  await page.getByRole('button', { name: '下一张', exact: true }).click();
  assert.equal(await page.locator('.image-counter').innerText(), '2 / 3'); record('Douyin carousel selects the next image');
  assert.equal(await page.locator('.layout-caption').innerText(), caption);
  await page.screenshot({ path: path.join(output, '03-douyin-preview.png') });
  await page.getByRole('button', { name: '复制草稿', exact: true }).click();
  await waitFor(async () => (await title.inputValue()).endsWith('副本'));
  await page.getByRole('textbox', { name: '搜索草稿', exact: true }).fill('没有这个标题');
  assert.equal(await page.locator('.draft-card').count(), 0);
  await page.getByRole('button', { name: '清空搜索', exact: true }).click();
  await page.locator('.draft-card').filter({ hasText: '海边的慢日子' }).filter({ hasNotText: '副本' }).click();
  await waitFor(async () => await title.inputValue() === '海边的慢日子'); record('Draft duplication, search and switching retain content');
  await page.getByRole('button', { name: '从视频取材', exact: true }).click();
  await selectFiles([inputVideo]);
  await page.locator('.video-source-label').getByRole('button', { name: '选择视频', exact: true }).click();
  await waitFor(async () => await page.locator('.video-source-label').innerText().then(t => t.includes('短视频.mp4')));
  await page.getByRole('button', { name: '下一帧', exact: true }).click();
  await page.getByRole('button', { name: '下一帧', exact: true }).click();
  await page.getByRole('button', { name: '截取并加入草稿', exact: true }).click();
  await waitFor(async () => await cards().count() === 4); record('Video frame stepping and screenshot add a real image to the draft');
  await page.getByRole('button', { name: '制作实况', exact: true }).click();
  const clipEnd = Number(await page.getByRole('spinbutton', { name: '实况结束时间', exact: true }).inputValue());
  assert.ok(clipEnd <= 1.21);
  await page.getByRole('checkbox', { name: '保留原声', exact: true }).uncheck();
  await page.screenshot({ path: path.join(output, '04-video-studio.png') });
  await page.getByRole('button', { name: '制作并加入草稿', exact: true }).click();
  await waitFor(async () => await cards().count() === 5);
  await page.getByRole('button', { name: '返回图文', exact: true }).click();
  assert.equal(await page.locator('.asset-live').count(), 1); record('Short video produces a muted live asset with bounded duration');
  await page.getByRole('button', { name: '导出素材包', exact: true }).click();
  const exportParent = path.join(work, 'exports'); await mkdir(exportParent);
  await selectFiles([exportParent]);
  await page.getByRole('button', { name: '选择位置', exact: true }).click();
  await page.getByRole('button', { name: '开始导出', exact: true }).click();
  await page.getByRole('heading', { name: '素材包已保存', exact: true }).waitFor();
  const folder = await page.locator('.export-success .destination-path').innerText();
  assert.equal(await readFile(path.join(folder, '文案.txt'), 'utf8'), caption);
  const manifest = JSON.parse(await readFile(path.join(folder, '素材清单.json'), 'utf8'));
  assert.equal(manifest.items.length, 5); assert.equal(manifest.items[4].files.length, 3);
  assert.equal(manifest.deviceVerification, 'pending');
  await page.screenshot({ path: path.join(output, '05-export-complete.png') }); record('Preview exports ordered PNG, paired Apple resources, Android Motion Photo and caption');
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  await page.getByRole('button', { name: '导出素材包', exact: true }).click();
  await page.getByRole('button', { name: /ZIP 压缩包/ }).click();
  await page.getByRole('button', { name: '开始导出', exact: true }).click();
  await page.getByRole('heading', { name: '素材包已保存', exact: true }).waitFor();
  const zip = await page.locator('.export-success .destination-path').innerText(); assert.equal((await readFile(zip)).subarray(0, 2).toString(), 'PK'); record('ZIP export completes without replacing the folder export');
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  // A close immediately after typing must flush the debounce, without waiting for the save timer.
  await page.getByRole('textbox', { name: '发布文案', exact: true }).fill(caption + '\n刚刚补上的一句。');
  await application.close(); application = null;
  await launch();
  await page.locator('.draft-card').filter({ hasText: '海边的慢日子' }).filter({ hasNotText: '副本' }).click();
  assert.equal(await page.getByRole('textbox', { name: '发布文案', exact: true }).inputValue(), caption + '\n刚刚补上的一句。');
  assert.equal(await cards().count(), 5); record('Immediate exit flushes unsaved edits; restart restores caption and media');
  const boundary = await page.evaluate(async () => {
    try { await window.desktop.startJob(crypto.randomUUID(), 'export', { directory: 'C:/', draftId: crypto.randomUUID(), format: 'folder', targets: [] }); return false; }
    catch { return true; }
  }); assert.equal(boundary, true); record('IPC rejects export destinations not selected through the native dialog');
  assert.deepEqual(errors, []); record('No renderer runtime errors');
  await writeFile(path.join(output, 'qa-results.json'), JSON.stringify({ passed: true, assertions, rendererErrors: errors, nativeDeviceTests: 'not performed', cleanVirtualMachine: 'not performed; packaged executable tested with restricted child PATH' }, null, 2));
} catch (error) {
  if (page) { try { await page.screenshot({ path: path.join(output, 'failure.png') }); await writeFile(path.join(output, 'failure-dom.txt'), await page.locator('body').innerText()); } catch {} }
  throw error;
} finally {
  if (application) await application.close().catch(() => {});
  await rm(work, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
}
