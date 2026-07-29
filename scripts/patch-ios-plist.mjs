import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const plistPath = path.join(root, 'ios/App/App/Info.plist');

if (!fs.existsSync(plistPath)) {
  console.warn('patch-ios-plist: Info.plist not found, skip');
  process.exit(0);
}

let plist = fs.readFileSync(plistPath, 'utf8');

const entries = {
  'NSPhotoLibraryAddUsageDescription': '保存二维码到相册',
  'NSPhotoLibraryUsageDescription': '读取图片用于上传',
};

for (const [key, value] of Object.entries(entries)) {
  const entry = `\t<key>${key}</key>\n\t<string>${value}</string>`;
  const tag = '<key>CFBundleDevelopmentRegion';
  if (!plist.includes(`<key>${key}</key>`)) {
    plist = plist.replace(tag, `${entry}\n\t${tag}`);
    console.log(`patch-ios-plist: added ${key}`);
  } else {
    console.log(`patch-ios-plist: ${key} already exists`);
  }
}

if (!plist.includes('CFBundleLocalizations')) {
  const localizationsEntry = `\t<key>CFBundleLocalizations</key>\n\t<array>\n\t\t<string>zh-Hans</string>\n\t\t<string>zh-Hant</string>\n\t\t<string>zh</string>\n\t\t<string>en</string>\n\t</array>`;
  const tag = '<key>CFBundleDevelopmentRegion';
  plist = plist.replace(tag, `${localizationsEntry}\n\t${tag}`);
  console.log('patch-ios-plist: added CFBundleLocalizations');
} else {
  console.log('patch-ios-plist: CFBundleLocalizations already exists');
}

fs.writeFileSync(plistPath, plist, 'utf8');
console.log('patch-ios-plist: done');
