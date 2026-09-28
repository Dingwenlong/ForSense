import { _electron as electron } from 'playwright';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const executable = process.env.SOCIAL_COPY_QA_EXECUTABLE || path.join(root, 'out/SocialCopyStudio-win32-x64/SocialCopyStudio.exe');
const output = path.join(root, 'output/playwright'); await mkdir(output, { recursive: true });
const dataRoot = path.join(root, 'output/test-data'); await mkdir(dataRoot, { recursive: true });
const work = await mkdtemp(path.join(dataRoot, 'desktop-'));
const ffmpeg = path.join(root, 'resources/media/ffmpeg.exe');
const assertions = [], errors = [];
let application, page, clipboardAvailable = false;
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
  clipboardAvailable = await application.evaluate(async ({ clipboard }) => {
    try { await clipboard.writeText('social-copy-clipboard-check'); return await clipboard.readText() === 'social-copy-clipboard-check'; } catch { return false; }
  });
}
async function selectFiles(paths) {
  await application.evaluate(({ dialog }, files) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files }); }, paths);
}
const photos = () => page.locator('.wechat-proof__photo');
const dismissNotice = async () => { const button = page.getByRole('button', { name: '关闭提示', exact: true }); if (await button.count()) await button.click(); };

try {
  const images = [];
  for (let i = 0; i < 4; i++) {
    const file = path.join(work, `风景 ${i + 1}.png`);
    const colors = [['#9ebdc5', '#578e92', '#e0d2b6'], ['#bec6a4', '#597458', '#b3ad83'], ['#b9b7ad', '#6f8b90', '#e6c7ad'], ['#c8b9ad', '#8b665c', '#ead8bc']][i];
    execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', `color=c=${colors[0]}:s=900x1200:d=0.1`, '-vf', `drawbox=x=0:y=550:w=900:h=650:color=${colors[1]}:t=fill,drawbox=x=0:y=920:w=900:h=280:color=${colors[2]}:t=fill,drawbox=x=130:y=250:w=80:h=80:color=#f4e9ca:t=fill`, '-frames:v', '1', '-update', '1', file], { windowsHide: true }); images.push(file);
  }
  const inputVideo = path.join(work, '短视频.mp4');
  execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=30:duration=1.2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', inputVideo], { windowsHide: true });

  await launch();
  assert.equal(await page.locator('.library-card').count(), 0);
  await page.screenshot({ path: path.join(output, '01-library.png') });
  record('Packaged app opens its empty draft library');

  await page.getByRole('button', { name: '新建草稿', exact: true }).click();
  await page.getByRole('heading', { name: '实时预览', exact: true }).waitFor();
  assert.equal(await page.locator('.workbench-editor, .asset-card, .editor-tabs').count(), 0);
  assert.equal(await page.locator('.wechat-proof__add').count(), 1);
  assert.equal(await page.getByRole('textbox', { name: '发布文案', exact: true }).count(), 1);
  await page.screenshot({ path: path.join(output, '02-empty-preview.png') });
  record('Preview contains an image placeholder and inline caption with no left editor');

  const title = page.getByRole('textbox', { name: '草稿标题', exact: true });
  await title.fill('海边的慢日子');
  const caption = '把时间留给风，把心情留给海。\n\n走走停停，收集一些简单的快乐。🌊\n#周末日常 #慢生活';
  await page.getByRole('textbox', { name: '发布文案', exact: true }).fill(caption);
  await page.getByRole('button', { name: '复制文案', exact: true }).click();
  if (clipboardAvailable) {
    await page.getByText('文案已复制，可粘贴到发布页面', { exact: true }).waitFor();
    assert.equal(await application.evaluate(({ clipboard }) => clipboard.readText()), caption);
  } else {
    await page.getByRole('alert').filter({ hasText: '系统剪贴板暂不可用' }).waitFor();
    await dismissNotice();
  }
  await page.screenshot({ path: path.join(output, '03-wechat-caption.png') });
  record(clipboardAvailable ? 'WeChat caption saves and copies to the OS clipboard' : 'WeChat caption saves; inaccessible OS clipboard reports failure instead of success');

  await selectFiles(images.slice(0, 3));
  await page.locator('.wechat-proof__add').click();
  await page.getByRole('dialog', { name: '添加图片', exact: true }).getByRole('button', { name: '从电脑导入图片', exact: true }).click();
  await waitFor(async () => await photos().count() === 3);
  await page.getByRole('dialog', { name: '添加图片', exact: true }).waitFor({ state: 'hidden' });
  await waitFor(async () => await photos().first().isEnabled());
  assert.equal(await page.locator('.wechat-proof__add').count(), 1);
  const first = await photos().first().locator('img').getAttribute('src');
  await photos().first().dragTo(photos().nth(2));
  await waitFor(async () => await photos().nth(2).locator('img').getAttribute('src') === first);
  await photos().nth(2).focus();
  await page.keyboard.press('Alt+ArrowLeft');
  await waitFor(async () => await photos().nth(1).locator('img').getAttribute('src') === first);
  await photos().first().click();
  await page.getByRole('dialog', { name: '调整画面' }).waitFor();
  await page.getByRole('button', { name: '1:1', exact: true }).click();
  await page.screenshot({ path: path.join(output, '04-image-editor.png') });
  await page.getByRole('button', { name: '应用调整', exact: true }).click();
  await page.getByRole('dialog', { name: '调整画面' }).waitFor({ state: 'hidden' });
  await page.screenshot({ path: path.join(output, '05-wechat-preview.png') });
  record('WeChat placeholder adds images; drag, keyboard reorder and click-to-edit remain usable');

  await page.getByRole('switch', { name: '抖音预览', exact: true }).click();
  assert.equal(await page.locator('.douyin-proof').count(), 1);
  assert.equal(await page.locator('.douyin-proof__add').count(), 1);
  await page.getByRole('button', { name: '编辑发布文案', exact: true }).click();
  const douyinCaption = caption + '\n#新话题';
  await page.getByRole('textbox', { name: '发布文案', exact: true }).fill(douyinCaption);
  assert.equal(await page.locator('.douyin-proof__hashtag').count(), 0);
  await page.locator('.douyin-proof__header').click();
  assert.equal(await page.locator('.douyin-proof__hashtag').count(), 3);
  assert.equal(await page.locator('.layout-caption').innerText(), douyinCaption);
  await selectFiles([images[3]]);
  await page.locator('.douyin-proof__add').click();
  await page.getByRole('dialog', { name: '添加图片', exact: true }).getByRole('button', { name: '从电脑导入图片', exact: true }).click();
  await waitFor(async () => await page.locator('.image-counter').innerText() === '1/4');
  await page.getByRole('button', { name: '下一张', exact: true }).click();
  const movingImage = await page.locator('.douyin-proof__image img').getAttribute('src');
  const bar = await page.locator('.douyin-proof__segments').boundingBox();
  await page.locator('.douyin-proof__image').dragTo(page.locator('.douyin-proof__segments'), { targetPosition: { x: bar.width * .86, y: bar.height / 2 } });
  assert.equal(await page.locator('.image-counter').innerText(), '4/4');
  assert.equal(await page.locator('.douyin-proof__image img').getAttribute('src'), movingImage);
  await page.locator('.douyin-proof__image').click();
  await page.getByRole('dialog', { name: '调整画面' }).waitFor();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.screenshot({ path: path.join(output, '06-douyin-preview.png') });
  record('Douyin placeholder adds a fourth image and inline caption editing updates topics');

  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1080, 720));
  await waitFor(async () => await page.evaluate(() => window.innerWidth <= 1080));
  const viewport = await page.evaluate(() => {
    const button = [...document.querySelectorAll('.workbench-toolbar button')].find(item => item.textContent.includes('导出素材包'));
    const rect = button.getBoundingClientRect(); const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return { fits: document.documentElement.scrollWidth <= window.innerWidth, exportVisible: rect.left >= 0 && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight, exportUnobstructed: button.contains(target) };
  });
  assert.deepEqual(viewport, { fits: true, exportVisible: true, exportUnobstructed: true });
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 930));
  record('Preview controls and export remain accessible in the minimum desktop window');

  await page.getByRole('button', { name: '另存草稿', exact: true }).click();
  await page.getByRole('textbox', { name: '新草稿名称', exact: true }).fill('海边的慢日子 · 副本');
  await page.getByRole('button', { name: '保存新草稿', exact: true }).click();
  await waitFor(async () => (await title.inputValue()).endsWith('副本'));
  await page.locator('.douyin-proof__image').click();
  await page.getByRole('dialog', { name: '调整画面' }).getByRole('button', { name: '移除图片', exact: true }).click();
  await waitFor(async () => (await page.locator('.image-counter').innerText()).endsWith('/3'));
  await page.getByRole('button', { name: '返回草稿列表', exact: true }).click();
  await page.getByRole('heading', { name: '我的草稿', exact: true }).waitFor();
  assert.equal(await page.locator('.library-card').count(), 2);
  await page.getByRole('textbox', { name: '搜索草稿', exact: true }).fill('没有这个标题');
  assert.equal(await page.locator('.library-card').count(), 0);
  await page.getByRole('button', { name: '清空搜索', exact: true }).click();
  await page.getByRole('combobox', { name: '添加平台标签', exact: true }).selectOption('moments');
  assert.equal(await page.locator('.library-card').count(), 0);
  await page.getByRole('combobox', { name: '添加平台标签', exact: true }).selectOption('douyin');
  assert.equal(await page.locator('.library-card').count(), 2);
  await page.getByRole('textbox', { name: '搜索草稿', exact: true }).fill('副本');
  assert.equal(await page.locator('.library-card').count(), 1);
  await page.getByRole('button', { name: '移除抖音标签', exact: true }).click();
  assert.equal(await page.getByRole('textbox', { name: '搜索草稿', exact: true }).inputValue(), '副本');
  assert.equal(await page.locator('.library-card').count(), 1);
  await page.getByRole('button', { name: '清空搜索', exact: true }).click();
  await page.getByRole('combobox', { name: '添加平台标签', exact: true }).selectOption('douyin');
  await page.getByRole('textbox', { name: '搜索草稿', exact: true }).fill('海边 慢');
  assert.equal(await page.locator('.library-card').count(), 2);
  await page.screenshot({ path: path.join(output, '12-tag-search.png') });
  await page.getByRole('button', { name: '清空搜索', exact: true }).click();
  await page.locator('.library-card').filter({ hasNotText: '副本' }).locator('.library-card-open').click();
  await page.getByRole('button', { name: '返回草稿列表', exact: true }).click();
  await page.locator('.library-card').filter({ hasText: '副本' }).getByRole('button', { name: /^删除草稿 / }).click();
  await page.getByRole('dialog', { name: '删除这份草稿？' }).getByRole('button', { name: '删除草稿', exact: true }).click();
  await page.getByRole('dialog', { name: '删除这份草稿？' }).waitFor({ state: 'hidden' });
  await page.getByRole('heading', { name: '我的草稿', exact: true }).waitFor();
  assert.equal(await page.locator('.library-card').count(), 1);
  await page.locator('.library-card').filter({ hasText: '海边的慢日子' }).locator('.library-card-open').click();
  record('Save as preserves the original; platform tags combine with keywords; deletion works from the list');

  await page.getByRole('button', { name: '从视频取材', exact: true }).click();
  await selectFiles([inputVideo]);
  await page.locator('.video-source-label').getByRole('button', { name: '选择视频', exact: true }).click();
  await waitFor(async () => await page.locator('.video-source-label').innerText().then(t => t.includes('短视频.mp4')));
  await page.getByRole('button', { name: '下一帧', exact: true }).click();
  await page.getByRole('button', { name: '截取并加入草稿', exact: true }).click();
  await waitFor(async () => (await page.locator('.image-counter').innerText()).endsWith('/5'));
  await page.getByRole('button', { name: '制作实况', exact: true }).click();
  await page.getByRole('checkbox', { name: '保留原声', exact: true }).uncheck();
  await page.getByRole('button', { name: '制作并加入草稿', exact: true }).click();
  await waitFor(async () => (await page.locator('.image-counter').innerText()).endsWith('/6'));
  await page.getByRole('button', { name: '返回图文', exact: true }).click();
  await page.getByRole('switch', { name: '抖音预览', exact: true }).click();
  assert.equal(await photos().count(), 6);
  await page.locator('.wechat-proof__live').click();
  await page.getByRole('dialog', { name: '实况预览' }).waitFor();
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  record('Video frame and Live Photo still enter the same preview without a sidebar');

  await page.getByRole('button', { name: '导出素材包', exact: true }).click();
  const exportParent = path.join(work, 'exports'); await mkdir(exportParent);
  await selectFiles([exportParent]);
  await page.getByRole('button', { name: '选择位置', exact: true }).click();
  await page.getByRole('button', { name: '开始导出', exact: true }).click();
  await page.getByRole('heading', { name: '素材包已保存', exact: true }).waitFor();
  const folder = await page.locator('.export-success .destination-path').innerText();
  assert.equal(await readFile(path.join(folder, '文案.txt'), 'utf8'), douyinCaption);
  const manifest = JSON.parse(await readFile(path.join(folder, '素材清单.json'), 'utf8'));
  assert.equal(manifest.items.length, 6); assert.equal(manifest.items[5].files.length, 3);
  assert.equal(manifest.deviceVerification, 'pending');
  await page.screenshot({ path: path.join(output, '07-export.png') });
  record('Preview toolbar exports ordered images, Live Photo formats and inline caption');

  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  await page.getByRole('button', { name: '导出素材包', exact: true }).click();
  await page.getByRole('button', { name: /ZIP 压缩包/ }).click();
  await page.getByRole('button', { name: '开始导出', exact: true }).click();
  await page.getByRole('heading', { name: '素材包已保存', exact: true }).waitFor();
  const zip = await page.locator('.export-success .destination-path').innerText();
  assert.equal((await readFile(zip)).subarray(0, 2).toString(), 'PK');
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  record('ZIP export remains available from the preview toolbar');

  await page.getByRole('textbox', { name: '发布文案', exact: true }).fill(douyinCaption + '\n刚刚补上的一句。');
  await application.close(); application = null;
  await launch();
  await page.locator('.library-card').filter({ hasText: '海边的慢日子' }).locator('.library-card-open').click();
  assert.equal(await page.getByRole('textbox', { name: '发布文案', exact: true }).inputValue(), douyinCaption + '\n刚刚补上的一句。');
  assert.equal(await photos().count(), 6);
  record('Closing while editing inline caption flushes the draft for restart');

  await page.getByRole('button', { name: '返回草稿列表', exact: true }).click();
  await page.getByRole('button', { name: '新建草稿', exact: true }).click();
  await page.getByRole('switch', { name: '抖音预览', exact: true }).click();
  await page.locator('.douyin-proof__add-empty').waitFor();
  await page.getByRole('button', { name: '编辑发布文案', exact: true }).click();
  await page.getByRole('textbox', { name: '发布文案', exact: true }).fill('只有文字也能保存。');
  await page.getByRole('button', { name: '导出素材包', exact: true }).click();
  await selectFiles([exportParent]);
  await page.getByRole('button', { name: '选择位置', exact: true }).click();
  await page.getByRole('button', { name: '开始导出', exact: true }).click();
  await page.getByRole('heading', { name: '素材包已保存', exact: true }).waitFor();
  const textOnlyFolder = await page.locator('.export-success .destination-path').innerText();
  assert.equal(await readFile(path.join(textOnlyFolder, '文案.txt'), 'utf8'), '只有文字也能保存。');
  assert.equal(JSON.parse(await readFile(path.join(textOnlyFolder, '素材清单.json'), 'utf8')).items.length, 0);
  record('Text-only Douyin draft can be edited and exported directly in preview');

  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  await dismissNotice();
  await page.getByRole('navigation', { name: '工作区导航' }).getByRole('button', { name: '素材库', exact: true }).click();
  await page.getByRole('heading', { name: '素材库', exact: true }).waitFor();
  await waitFor(async () => await page.locator('.material-card').count() >= 7);
  await page.getByRole('combobox', { name: '素材分类', exact: true }).selectOption('video');
  await page.getByRole('button', { name: '打开视频取材', exact: true }).click();
  await page.locator('.video-source-label').filter({ hasText: '短视频.mp4' }).waitFor();
  await page.getByRole('button', { name: '截取并保存到素材库', exact: true }).click();
  await page.getByText('素材已保存到素材库', { exact: true }).waitFor();
  await page.getByRole('button', { name: '返回素材库', exact: true }).click();
  await dismissNotice();
  record('Global library includes existing images, Live Photos and reusable imported videos');

  await page.getByRole('combobox', { name: '素材分类', exact: true }).selectOption('all');
  await selectFiles([path.join(root, 'public/ai-examples/product-before.png')]);
  await page.getByRole('button', { name: '从电脑导入图片', exact: true }).click();
  await page.getByRole('searchbox', { name: '搜索素材', exact: true }).fill('product-before');
  await page.getByRole('button', { name: '查看素材 product-before.png', exact: true }).click();
  await page.getByRole('textbox', { name: '素材名称', exact: true }).fill('案例原图');
  await page.getByRole('button', { name: '保存名称', exact: true }).click();
  await page.getByRole('searchbox', { name: '搜索素材', exact: true }).fill('案例原图');
  await page.locator('.material-card').getByRole('button', { name: '收藏', exact: true }).click();
  await page.getByRole('button', { name: '归档素材', exact: true }).click();
  await waitFor(async () => await page.locator('.material-card').count() === 0);
  await page.getByRole('combobox', { name: '素材分类', exact: true }).selectOption('archived');
  assert.equal(await page.locator('.material-card').count(), 1);
  await page.getByRole('button', { name: '恢复到素材库', exact: true }).click();
  await page.getByRole('button', { name: '恢复到素材库', exact: true }).waitFor({ state: 'hidden' });
  await page.getByRole('combobox', { name: '素材分类', exact: true }).selectOption('favorites');
  assert.equal(await page.locator('.material-card').count(), 1);
  await page.getByRole('button', { name: '收起详情', exact: true }).click();
  await dismissNotice();
  await page.screenshot({ path: path.join(output, '08-global-library.png') });
  record('Global material import, search, rename, favorite, archive and restore work');

  await page.getByRole('button', { name: '查看素材 案例原图', exact: true }).click();
  await page.getByRole('region', { name: '素材详情', exact: true }).getByRole('button', { name: 'AI 图片优化', exact: true }).click();
  await page.getByRole('heading', { name: '选择一种优化方向', exact: true }).waitFor();
  assert.equal(await page.locator('.template-option').count(), 20);
  await page.getByRole('button', { name: '商品柔光 商品 · 让材质、轮廓和背景更干净。', exact: true }).click();
  await page.getByRole('button', { name: '复制原图', exact: true }).click();
  if (clipboardAvailable) {
    await page.getByText('图片已复制，请先粘贴到外部工具，再复制提示词', { exact: true }).waitFor();
    const clipboardImage = await application.evaluate(async ({ clipboard, nativeImage }) => {
      const items = await clipboard.read(); const item = items.find(value => value.types.includes('image/png'));
      if (!item) return null; const blob = await item.getType('image/png');
      return nativeImage.createFromBuffer(Buffer.from(await blob.arrayBuffer())).getSize();
    });
    assert.ok(clipboardImage?.width > 1000 && clipboardImage.height > 1000);
  } else await page.getByRole('alert').filter({ hasText: '系统剪贴板暂不可用' }).waitFor();
  await dismissNotice();
  const prompt = await page.getByRole('textbox', { name: '优化提示词', exact: true }).inputValue();
  await page.getByRole('textbox', { name: '优化提示词', exact: true }).fill(prompt + '\n自定义：保留完整杯柄。');
  await page.getByRole('button', { name: '复制提示词', exact: true }).click();
  if (clipboardAvailable) {
    await page.getByText('提示词已复制', { exact: true }).waitFor();
    assert.equal(await application.evaluate(({ clipboard }) => clipboard.readText()), prompt + '\n自定义：保留完整杯柄。');
  } else await page.getByRole('alert').filter({ hasText: '系统剪贴板暂不可用' }).waitFor();
  await dismissNotice();
  await page.screenshot({ path: path.join(output, '09-ai-copy-workflow.png') });
  record(clipboardAvailable ? '20 editable templates; image and prompt copied to OS clipboard' : '20 editable templates; image and prompt copy report inaccessible clipboard with retry');

  await page.getByRole('button', { name: '前后对比案例', exact: true }).click();
  await waitFor(async () => await page.locator('.optimization-example img').evaluateAll(imgs => imgs.length === 4 && imgs.every(img => img.complete && img.naturalWidth > 0)));
  await page.screenshot({ path: path.join(output, '10-ai-examples.png') });
  await page.locator('.optimization-example').first().getByRole('button', { name: '滑动对比', exact: true }).click();
  const range = page.getByRole('slider', { name: '商品案例对比位置', exact: true });
  await range.fill('25'); assert.equal(await range.inputValue(), '25');
  await range.focus(); await page.keyboard.press('ArrowRight'); assert.equal(await range.inputValue(), '26');
  await page.getByRole('button', { name: '优化图片', exact: true }).click();
  await selectFiles([path.join(root, 'public/ai-examples/product-after.png')]);
  await page.getByRole('button', { name: '导入优化结果', exact: true }).click();
  await page.getByRole('button', { name: '复制优化图', exact: true }).waitFor();
  await dismissNotice();
  await page.locator('.optimization-result').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, '11-ai-result.png') });
  await page.getByRole('button', { name: '将结果加入当前草稿', exact: true }).click();
  await page.getByRole('heading', { name: '实时预览', exact: true }).waitFor();
  assert.equal(await page.locator('.image-counter').innerText(), '1/1');
  const manualResult = (await page.evaluate(() => window.desktop.listLibrary())).assets.find(a => a.optimization);
  assert.equal(manualResult.optimization.prompt, prompt + '\n自定义：保留完整杯柄。');
  record('Bundled examples render offline and manual results preserve provenance, compare and enter a draft');

  await dismissNotice();
  await page.locator('.douyin-proof__add').click();
  const picker = page.getByRole('dialog', { name: '添加图片', exact: true });
  await picker.getByRole('searchbox', { name: '搜索素材', exact: true }).fill('案例原图');
  await picker.getByRole('checkbox', { name: '选择 案例原图', exact: true }).check();
  await picker.getByRole('button', { name: '加入当前草稿', exact: true }).click();
  assert.equal(await page.locator('.image-counter').innerText(), '1/2');
  await dismissNotice();
  await page.locator('.douyin-proof__add').click();
  await picker.getByRole('searchbox', { name: '搜索素材', exact: true }).fill('案例原图');
  assert.equal(await picker.getByRole('checkbox', { name: '选择 案例原图', exact: true }).isDisabled(), true);
  await picker.getByRole('button', { name: '关闭窗口', exact: true }).click();
  await application.close(); application = null;
  await launch();
  await page.getByRole('navigation', { name: '工作区导航' }).getByRole('button', { name: '素材库', exact: true }).click();
  await page.getByRole('combobox', { name: '素材分类', exact: true }).selectOption('ai');
  await page.getByRole('button', { name: '查看素材 product-after.png', exact: true }).click();
  await page.getByRole('region', { name: '素材详情', exact: true }).getByRole('button', { name: 'AI 图片优化', exact: true }).click();
  assert.equal(await page.getByRole('textbox', { name: '优化提示词', exact: true }).inputValue(), prompt + '\n自定义：保留完整杯柄。');
  assert.equal(await page.locator('.optimization-result img').count(), 2);
  record('Preview + reuses library assets without duplicates; comparison and prompt survive restart');

  await page.getByRole('button', { name: '返回草稿列表', exact: true }).click();
  while (await page.locator('.library-card').count() < 10) {
    await page.getByRole('button', { name: '新建草稿', exact: true }).click();
    await page.getByRole('heading', { name: '实时预览', exact: true }).waitFor();
    await page.getByRole('button', { name: '返回草稿列表', exact: true }).click();
    await page.getByRole('heading', { name: '我的草稿', exact: true }).waitFor();
  }
  assert.equal(await page.getByRole('button', { name: '新建草稿', exact: true }).isDisabled(), true);
  await page.getByRole('textbox', { name: '搜索草稿', exact: true }).fill('不匹配的筛选');
  assert.equal(await page.locator('.library-card').count(), 0);
  assert.equal(await page.getByRole('button', { name: '新建草稿', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: '清空搜索', exact: true }).click();
  const capacity = await page.evaluate(async () => {
    const { drafts } = await window.desktop.listDrafts();
    const results = await Promise.allSettled([window.desktop.createDraft('moments'), window.desktop.saveDraftAs(drafts[0].id, '超出上限')]);
    return { rejected: results.every(result => result.status === 'rejected'), count: (await window.desktop.listDrafts()).drafts.length };
  });
  assert.deepEqual(capacity, { rejected: true, count: 10 });
  await page.screenshot({ path: path.join(output, '13-draft-limit.png') });
  await page.locator('.library-card').first().locator('.library-card-open').click();
  assert.equal(await page.getByRole('button', { name: '另存草稿', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: '返回草稿列表', exact: true }).click();
  await page.locator('.library-card').first().getByRole('button', { name: /^删除草稿 / }).click();
  await page.getByRole('dialog', { name: '删除这份草稿？' }).getByRole('button', { name: '删除草稿', exact: true }).click();
  await page.getByRole('dialog', { name: '删除这份草稿？' }).waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.library-card').count(), 9);
  assert.equal(await page.getByRole('button', { name: '新建草稿', exact: true }).isEnabled(), true);
  record('Ten-draft limit covers filtered lists, new drafts and save-as; deleting a draft restores availability');

  const boundary = await page.evaluate(async () => {
    try { await window.desktop.startJob(crypto.randomUUID(), 'export', { directory: 'C:/', draftId: crypto.randomUUID(), format: 'folder', targets: [] }); return false; }
    catch { return true; }
  });
  assert.equal(boundary, true); assert.deepEqual(errors, []);
  record('Export path boundary and renderer runtime remain sound');
  await writeFile(path.join(output, 'qa-results.json'), JSON.stringify({ passed: true, assertions, rendererErrors: errors, clipboardReadback: clipboardAvailable ? 'passed' : 'unavailable in this Windows test session; failure reporting verified; successful native paste requires interactive-session verification', nativeDeviceTests: 'not performed', cleanVirtualMachine: 'not performed; packaged executable tested with restricted child PATH' }, null, 2));
} catch (error) {
  if (page) { try { await page.screenshot({ path: path.join(output, 'failure.png') }); await writeFile(path.join(output, 'failure-dom.txt'), await page.locator('body').innerText()); } catch {} }
  throw error;
} finally {
  if (application) await application.close().catch(() => {});
  console.log('Test materials retained:', path.relative(root, work));
}
