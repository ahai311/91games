/**
 * 将 resources/icon.png 写入 iOS AppIcon asset catalog
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

const sizes = [
  { name: 'icon-20.png', size: 20 },
  { name: 'icon-29.png', size: 29 },
  { name: 'icon-40.png', size: 40 },
  { name: 'icon-58.png', size: 58 },
  { name: 'icon-60.png', size: 60 },
  { name: 'icon-76.png', size: 76 },
  { name: 'icon-80.png', size: 80 },
  { name: 'icon-87.png', size: 87 },
  { name: 'icon-120.png', size: 120 },
  { name: 'icon-152.png', size: 152 },
  { name: 'icon-167.png', size: 167 },
  { name: 'icon-180.png', size: 180 },
  { name: 'icon-1024.png', size: 1024 },
];

// Copy icon.png as all sizes (iOS will resize at runtime for non-retina)
for (const { name } of sizes) {
  fs.copyFileSync(iconSrc, path.join(iosAssets, name));
  console.log('apply-ios-assets:', name);
}

// Write Contents.json
const images = [];
for (const { name, size } of sizes) {
  const scale = size <= 29 ? [1, 2, 3] : size <= 80 ? [2, 3] : size <= 87 ? [2, 3] : [1, 2, 3];
  for (const s of scale) {
    if (size * s > 1024 && s > 1) continue;
    images.push({
      size: `${size}x${size}`,
      idiom: 'iphone',
      filename: name,
      scale: `${s}x`,
    });
  }
}

// iPad entries
const ipadSizes = [20, 29, 40, 76, 83.5];
for (const sz of ipadSizes) {
  const matching = sizes.find(s => Math.abs(s.size - sz) < 0.1);
  if (!matching) continue;
  const scale = sz <= 29 ? [1, 2] : [1, 2];
  for (const s of scale) {
    images.push({
      size: `${sz}x${sz}`,
      idiom: 'ipad',
      filename: matching.name,
      scale: `${s}x`,
    });
  }
}

// 1024 App Store
images.push({
  size: '1024x1024',
  idiom: 'ios-marketing',
  filename: 'icon-1024.png',
  scale: '1x',
});

const contents = { images, info: { version: 1, author: 'xcode' } };
fs.writeFileSync(path.join(iosAssets, 'Contents.json'), JSON.stringify(contents, null, 2));
console.log('apply-ios-assets: Contents.json written');
