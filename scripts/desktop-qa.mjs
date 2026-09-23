import { _electron as electron } from 'playwright';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
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
env.PATH = `${process.env.SystemRoot}\\system32;${process.env.SystemRoot}`;
delete env.ELECTRON_RUN_AS_NODE;

async function launch() {
  application = await electron.launch({ executablePath: executable, env, timeout: 30000 });
  page = await application.firstWindow(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('heading', { name: '我的草稿', exact: true }).waitFor();
}
async function selectFiles(paths) {
  await application.evaluate(({ dialog }, files) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files }); }, paths);
}
const cards = () => page.locator('.asset-card');
async function go(label) {
  await page.getByRole('navigation', { name: '制作步骤' }).getByRole('button', { name: label, exact: true }).click();
  const heading = label === '草稿列表' ? '我的草稿' : label === '1 图片素材' ? '图片素材' : label === '2 发布文案' ? '发布文案' : '预览与导出';
  await page.getByRole('heading', { name: heading, exact: true }).waitFor();
}

try {
  const images = [];
  for (let i = 0; i < 3; i++) {
    const file = path.join(work, `风景 ${i + 1}.png`);
    const colors = [['#9ebdc5', '#578e92', '#e0d2b6'], ['#bec6a4', '#597458', '#b3ad83'], ['#b9b7ad', '#6f8b90', '#e6c7ad']][i];
    execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', `color=c=${colors[0]}:s=900x1200:d=0.1`, '-vf', `drawbox=x=0:y=550:w=900:h=650:color=${colors[1]}:t=fill,drawbox=x=0:y=920:w=900:h=280:color=${colors[2]}:t=fill,drawbox=x=130:y=250:w=80:h=80:color=#f4e9ca:t=fill`, '-frames:v', '1', '-update', '1', file], { windowsHide: true }); images.push(file);
  }
  const inputVideo = path.join(work, '短视频.mp4');
  execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=30:duration=1.2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', inputVideo], { windowsHide: true });

  await launch();
  assert.equal(await page.locator('.library-card').count(), 0);
  assert.equal(await page.getByRole('textbox', { name: '发布文案', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '导出素材包', exact: true }).count(), 0);
  await page.screenshot({ path: path.join(output, '01-library.png') });
  record('Packaged app starts in an empty draft library, with editing and export hidden');

  await page.getByRole('button', { name: '新建朋友圈图文', exact: true }).click();
  await page.getByRole('heading', { name: '图片素材', exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: '图文排版预览', exact: true }).count(), 0);
  const title = page.getByRole('textbox', { name: '草稿标题', exact: true });
  await title.fill('海边的慢日子');
  await selectFiles(images);
  await page.getByRole('button', { name: '添加图片', exact: true }).click();
  await waitFor(async () => await cards().count() === 3);
  const first = await cards().first().locator('img').getAttribute('src');
  await page.getByRole('button', { name: '后移第 1 张', exact: true }).click();
  assert.notEqual(await cards().first().locator('img').getAttribute('src'), first);
  await page.getByRole('button', { name: '编辑第 1 张图片', exact: true }).click();
  await page.getByRole('button', { name: '1:1', exact: true }).click();
  await page.screenshot({ path: path.join(output, '02-crop.png') });
  await page.getByRole('button', { name: '应用调整', exact: true }).click();
  await page.getByRole('dialog', { name: '调整画面' }).waitFor({ state: 'hidden' });
  assert.match(await cards().first().innerText(), /900 × 900/);
  await page.screenshot({ path: path.join(output, '03-media.png') });
  record('Media page imports, reorders and crops without showing unrelated panels');

  await page.getByRole('button', { name: '下一步：写文案', exact: true }).click();
  await page.getByRole('heading', { name: '发布文案', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '添加图片', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '导出素材包', exact: true }).count(), 0);
  const caption = '把时间留给风，把心情留给海。\n\n走走停停，收集一些简单的快乐。🌊\n#周末日常 #慢生活';
  await page.getByRole('textbox', { name: '发布文案', exact: true }).fill(caption);
  await page.getByRole('button', { name: '复制文案', exact: true }).click();
  await page.getByText('文案已复制，可粘贴到发布页面', { exact: true }).waitFor();
  assert.equal(await application.evaluate(({ clipboard }) => clipboard.readText()), caption);
  await page.screenshot({ path: path.join(output, '04-caption.png') });
  record('Caption page edits and copies Unicode text while media and export controls stay hidden');

  await page.getByRole('button', { name: '上一步：图片素材', exact: true }).click();
  await page.getByRole('heading', { name: '图片素材', exact: true }).waitFor();
  assert.equal(await cards().count(), 3);
  await go('2 发布文案');
  assert.equal(await page.getByRole('textbox', { name: '发布文案', exact: true }).inputValue(), caption);
  await page.getByRole('button', { name: '下一步：预览导出', exact: true }).click();
  await page.getByRole('heading', { name: '预览与导出', exact: true }).waitFor();
  assert.equal(await page.locator('.preview-image').count(), 3);
  assert.equal(await page.locator('.layout-caption').innerText(), caption);
  assert.equal(await page.getByRole('textbox', { name: '发布文案', exact: true }).count(), 0);
  assert.equal(await page.locator('.wechat-proof__grid .wechat-proof__photo').count(), 3);
  assert.equal(await page.locator('.wechat-proof__setting').count(), 3);
  assert.equal(await page.getByRole('button', { name: '发表', exact: true }).count(), 0);
  await page.screenshot({ path: path.join(output, '05-wechat-review.png') });
  await page.locator('.wechat-proof').screenshot({ path: path.join(output, '05-wechat-card.png') });
  record('Back, forward and direct step navigation save the draft and show only review content');

  await go('1 图片素材');
  await page.locator('.platform-choice').getByRole('button', { name: '抖音图文', exact: true }).click();
  await go('3 预览导出');
  await page.getByRole('button', { name: '下一张', exact: true }).click();
  assert.equal(await page.locator('.image-counter').innerText(), '2/3');
  assert.equal(await page.locator('.douyin-proof__header').count(), 1);
  assert.equal(await page.locator('.douyin-proof__segments span').count(), 3);
  assert.equal(await page.locator('.douyin-proof__hashtag').count(), 2);
  await page.locator('.douyin-proof__media').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('.image-counter').innerText(), '3/3');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('.image-counter').innerText(), '3/3');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('.image-counter').innerText(), '2/3');
  assert.equal(await page.locator('.layout-caption').innerText(), caption);
  await page.locator('.douyin-proof__media').evaluate(element => element.blur());
  await page.screenshot({ path: path.join(output, '05-review.png') });
  await page.locator('.douyin-proof__footer').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, '05-douyin-lower.png') });
  await page.locator('.page-body').evaluate(element => { element.scrollTop = 0; });
  record('Douyin review uses the reference hierarchy, highlights caption tags and supports bounded image navigation');

  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1080, 720));
  await waitFor(async () => await page.evaluate(() => window.innerWidth <= 1080));
  const viewport = await page.evaluate(() => {
    const button = document.querySelector('.review-actions button');
    const box = button.getBoundingClientRect();
    const target = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return { fits: document.documentElement.scrollWidth <= window.innerWidth, exportVisible: box.left >= 0 && box.right <= window.innerWidth && box.bottom <= window.innerHeight, exportUnobstructed: button.contains(target) };
  });
  assert.deepEqual(viewport, { fits: true, exportVisible: true, exportUnobstructed: true });
  await page.screenshot({ path: path.join(output, '06-minimum-window.png') });
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 930));
  record('Minimum window keeps review and export accessible without horizontal overflow');

  await go('1 图片素材');
  await page.getByRole('button', { name: '复制草稿', exact: true }).click();
  await waitFor(async () => (await title.inputValue()).endsWith('副本'));
  await go('草稿列表');
  await page.getByRole('heading', { name: '我的草稿', exact: true }).waitFor();
  assert.equal(await page.locator('.library-card').count(), 2);
  await page.getByRole('textbox', { name: '搜索草稿', exact: true }).fill('没有这个标题');
  assert.equal(await page.locator('.library-card').count(), 0);
  await page.getByRole('button', { name: '清空搜索', exact: true }).click();
  await page.locator('.library-card').filter({ hasText: '副本' }).click();
  await page.getByRole('button', { name: '删除草稿', exact: true }).click();
  await page.getByRole('dialog', { name: '删除这份草稿？' }).getByRole('button', { name: '删除草稿', exact: true }).click();
  await page.getByRole('heading', { name: '我的草稿', exact: true }).waitFor();
  assert.equal(await page.locator('.library-card').count(), 1);
  await page.locator('.library-card').filter({ hasText: '海边的慢日子' }).click();
  record('Library search, duplicate, deletion and reopening preserve the original draft');

  await page.getByRole('button', { name: '从视频取材', exact: true }).click();
  await selectFiles([inputVideo]);
  await page.locator('.video-source-label').getByRole('button', { name: '选择视频', exact: true }).click();
  await waitFor(async () => await page.locator('.video-source-label').innerText().then(t => t.includes('短视频.mp4')));
  await page.getByRole('button', { name: '下一帧', exact: true }).click();
  await page.getByRole('button', { name: '下一帧', exact: true }).click();
  await page.getByRole('button', { name: '截取并加入草稿', exact: true }).click();
  await waitFor(async () => await cards().count() === 4);
  await page.getByRole('button', { name: '制作实况', exact: true }).click();
  const clipEnd = Number(await page.getByRole('spinbutton', { name: '实况结束时间', exact: true }).inputValue());
  assert.ok(clipEnd <= 1.21);
  await page.getByRole('checkbox', { name: '保留原声', exact: true }).uncheck();
  await page.screenshot({ path: path.join(output, '07-video-studio.png') });
  await page.getByRole('button', { name: '制作并加入草稿', exact: true }).click();
  await waitFor(async () => await cards().count() === 5);
  await page.getByRole('button', { name: '返回图文', exact: true }).click();
  assert.equal(await page.locator('.asset-live').count(), 1);
  record('Video frame and short muted Live Photo remain usable from the media page');

  await go('3 预览导出');
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
  await page.screenshot({ path: path.join(output, '08-export.png') });
  record('Review page exports ordered media, both Live Photo formats and an independent caption');

  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  await page.getByRole('button', { name: '导出素材包', exact: true }).click();
  await page.getByRole('button', { name: /ZIP 压缩包/ }).click();
  await page.getByRole('button', { name: '开始导出', exact: true }).click();
  await page.getByRole('heading', { name: '素材包已保存', exact: true }).waitFor();
  const zip = await page.locator('.export-success .destination-path').innerText();
  assert.equal((await readFile(zip)).subarray(0, 2).toString(), 'PK');
  record('ZIP export remains available from the final step');

  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  await go('2 发布文案');
  await page.getByRole('textbox', { name: '发布文案', exact: true }).fill(caption + '\n刚刚补上的一句。');
  await application.close(); application = null;
  await launch();
  await page.locator('.library-card').filter({ hasText: '海边的慢日子' }).click();
  assert.equal(await cards().count(), 5);
  await go('2 发布文案');
  assert.equal(await page.getByRole('textbox', { name: '发布文案', exact: true }).inputValue(), caption + '\n刚刚补上的一句。');
  record('Exit flushes edits and restart begins at the library with draft contents restored');

  await go('草稿列表');
  await page.getByRole('button', { name: '新建抖音图文', exact: true }).click();
  await page.getByRole('heading', { name: '图片素材', exact: true }).waitFor();
  assert.equal(await cards().count(), 0);
  await page.getByRole('button', { name: '下一步：写文案', exact: true }).click();
  await page.getByRole('textbox', { name: '发布文案', exact: true }).fill('只有文字也能保存。');
  await page.getByRole('button', { name: '下一步：预览导出', exact: true }).click();
  await page.getByRole('heading', { name: '预览与导出', exact: true }).waitFor();
  assert.equal(await page.locator('.douyin-proof').count(), 1);
  assert.equal(await page.getByRole('button', { name: '导出素材包', exact: true }).isEnabled(), true);
  await page.getByRole('button', { name: '导出素材包', exact: true }).click();
  await selectFiles([exportParent]);
  await page.getByRole('button', { name: '选择位置', exact: true }).click();
  await page.getByRole('button', { name: '开始导出', exact: true }).click();
  await page.getByRole('heading', { name: '素材包已保存', exact: true }).waitFor();
  const textOnlyFolder = await page.locator('.export-success .destination-path').innerText();
  assert.equal(await readFile(path.join(textOnlyFolder, '文案.txt'), 'utf8'), '只有文字也能保存。');
  assert.equal(JSON.parse(await readFile(path.join(textOnlyFolder, '素材清单.json'), 'utf8')).items.length, 0);
  record('A new text-only draft can skip media and export from the final page');

  const boundary = await page.evaluate(async () => {
    try { await window.desktop.startJob(crypto.randomUUID(), 'export', { directory: 'C:/', draftId: crypto.randomUUID(), format: 'folder', targets: [] }); return false; }
    catch { return true; }
  });
  assert.equal(boundary, true); assert.deepEqual(errors, []);
  record('Export path boundary and renderer runtime remain sound');
  await writeFile(path.join(output, 'qa-results.json'), JSON.stringify({ passed: true, assertions, rendererErrors: errors, nativeDeviceTests: 'not performed', cleanVirtualMachine: 'not performed; packaged executable tested with restricted child PATH' }, null, 2));
} catch (error) {
  if (page) { try { await page.screenshot({ path: path.join(output, 'failure.png') }); await writeFile(path.join(output, 'failure-dom.txt'), await page.locator('body').innerText()); } catch {} }
  throw error;
} finally {
  if (application) await application.close().catch(() => {});
  await rm(work, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
}
