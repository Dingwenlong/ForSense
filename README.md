# 片语 · Windows 图文工作台

本地整理朋友圈与抖音图文：管理草稿、排列与裁切图片、独立编辑文案、图文排版预览、导出素材包，以及视频截图和视频转 Apple Live Photo / Android Motion Photo。预览不包含手机边框或状态栏。

0.1.1 为无主题的功能基础版：使用系统字体、原生按钮和输入框，移除配色主题、装饰图标、阴影、动画和品牌宣传文案。仅保留分栏、滚动、弹窗、媒体尺寸和裁切选区所需的布局规则；草稿格式及媒体处理接口保持兼容。

0.1.2 将工作台拆为四个页面：草稿列表 → 图片素材 → 发布文案 → 预览与导出。每一步只展示当前任务相关的控件，顶部可直接跳转步骤，底部可前进或返回；切换步骤前保存草稿。视频取材仍从图片素材页进入。

0.1.3 的抖音图文预览参考图片帖子结构，展示账号栏、竖图轮播与进度、从文案提取的话题、完整文案、相关搜索与互动区示意，不显示虚构的互动数字。朋友圈预览参考微信发表前的编辑页，展示文案、最多九张图片与发布设置的位置；未储存的位置、提醒和可见范围明确标为“微信中设置”。

0.1.4 将文案编辑、图片整理、裁切和视频取材移到预览工作台的编辑栏中。打开草稿即进入工作台，左侧以“文案／图片”标签切换工具，右侧预览与导出一直可见，编辑即时反映到预览。微信与抖音预览卡片的版式保持不变。

0.1.5 支持在预览中直接调整图片顺序：微信九宫格拖到另一张，抖音单图拖向左右或下方进度条。单击预览图片打开裁切／旋转弹窗，微信实况另有播放入口。左侧列表保留文字按钮用于键盘操作。

## 开发

Windows x64、Node.js 24。安装依赖并准备受许可的 FFmpeg/FFprobe Windows 可执行文件：

```powershell
npm install
# 默认为本机 FFmpeg 安装目录；也可通过仅作用于当前进程的
# SOCIAL_COPY_FFMPEG_DIRECTORY 指定目录，包含 ffmpeg.exe 与 ffprobe.exe。
npm run prepare:media
npm run prepare:licenses
npm start
```

FFmpeg 需支持 libx264、AAC、PNG/JPEG 编解码、zscale 和 tonemap。准备脚本从已有本地安装复制工具，读取上一层 LICENSE 并生成工具清单。发布包包含工具，终端用户无需安装 Node.js 或 FFmpeg。

## 检查与打包

```powershell
npm run typecheck
npm test
npm run package
npm run qa
npm run make
```

Forge 输出位于 `out/`；Squirrel 安装包及便携 ZIP 位于 `out/make/`。

## 结构

- `src/core`：本地存储、媒体处理、实况封装、导出与任务取消。
- `src/main.ts` / `src/preload.ts`：文件选择、受限 IPC、本地媒体协议与生命周期。
- `src/renderer`：草稿列表与实时预览工作台、平台预览、视频工具、裁切与导出；`layout.css` 除参考预览卡片外只负责功能布局。
- `tests`：真实 FFmpeg 处理、元数据与异常路径验证。
- `scripts/desktop-qa.mjs`：在隔离资料库运行打包后的 Electron，验证桌面交互。

详细使用与兼容性见 `docs/使用说明.md`、`docs/格式说明.md`、`docs/验证记录.md`。
真机兼容性当前待验证。第三方组件和再分发条件见 `resources/licenses/`。
