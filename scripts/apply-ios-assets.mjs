/**
 * 将 resources/icon.png 写入 iOS AppIcon asset catalog
 * 用 sips 缩放到 1024x1024，删除冲突文件
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const iconSrc = path.join(root, 'resources', 'icon.png');
const iosAssets = path.join(root, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset');

if (!fs.existsSync(iconSrc) || fs.statSync(iconSrc).size < 4096) {
  console.warn('apply-ios-assets: resources/icon.png missing or too small, skip');
  process.exit(0);
}

fs.mkdirSync(iosAssets, { recursive: true });

// Remove ALL existing files in AppIcon.appiconset to avoid conflicts
for (const f of fs.readdirSync(iosAssets)) {
  fs.rmSync(path.join(iosAssets, f), { force: true });
}
console.log('apply-ios-assets: cleaned AppIcon.appiconset');

// Copy original icon first
const tempIcon = path.join(iosAssets, '_temp_icon.png');
fs.copyFileSync(iconSrc, tempIcon);

// Resize to exactly 1024x1024 using sips (macOS built-in)
try {
  execSync(`sips -z 1024 1024 "${tempIcon}" --out "${path.join(iosAssets, 'AppIcon.png')}"`, { stdio: 'pipe' });
  console.log('apply-ios-assets: resized to 1024x1024');
} catch {
  // Fallback: use original
  fs.copyFileSync(tempIcon, path.join(iosAssets, 'AppIcon.png'));
  console.log('apply-ios-assets: sips failed, using original size');
}
fs.rmSync(tempIcon, { force: true });

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
console.log('apply-ios-assets: done');
