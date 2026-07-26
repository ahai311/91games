/**
 * 将 resources/icon.png 写入 iOS AppIcon asset catalog
 * 现代 Xcode (iOS 13+) 只需要单张 1024x1024 图标
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const iconSrc = path.join(root, 'resources', 'icon.png');
const iosAssets = path.join(root, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset');

if (!fs.existsSync(iconSrc) || fs.statSync(iconSrc).size < 4096) {
  console.warn('apply-ios-assets: resources/icon.png missing or too small, skip');
  process.exit(0);
}

fs.mkdirSync(iosAssets, { recursive: true });

// Copy as AppIcon.png
const destIcon = path.join(iosAssets, 'AppIcon.png');
fs.copyFileSync(iconSrc, destIcon);
console.log('apply-ios-assets: AppIcon.png copied');

// Modern single-icon Contents.json (iOS 13+)
const contents = {
  images: [
    {
      filename: 'AppIcon.png',
      idiom: 'universal',
      platform: 'ios',
      size: '1024x1024'
    }
  ],
  info: {
    author: 'xcode',
    version: 1
  }
};

fs.writeFileSync(path.join(iosAssets, 'Contents.json'), JSON.stringify(contents, null, 2));
console.log('apply-ios-assets: Contents.json written');
