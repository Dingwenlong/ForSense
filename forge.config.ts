import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    executableName: 'SocialCopyStudio',
    icon: 'resources/icon',
    extraResource: ['resources/media', 'resources/licenses', 'resources/icon.ico', 'docs/使用说明.md'],
    win32metadata: { FileDescription: '片语 · 图文工作台', ProductName: '片语', CompanyName: 'Social Copy Studio' },
  },
  makers: [new MakerSquirrel({ name: 'SocialCopyStudio', setupExe: 'SocialCopyStudio-Setup.exe', setupIcon: 'resources/icon.ico', noMsi: true }), new MakerZIP({}, ['win32'])],
  plugins: [new VitePlugin({
    build: [
      { entry: 'src/main.ts', config: 'vite.main.config.ts', target: 'main' },
      { entry: 'src/preload.ts', config: 'vite.preload.config.ts', target: 'preload' },
    ],
    renderer: [{ name: 'main_window', config: 'vite.renderer.config.ts' }],
  })],
};
export default config;
