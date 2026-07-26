import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const vcPath = path.join(root, 'ios/App/App/ViewController.swift');

if (!fs.existsSync(vcPath)) {
  console.warn('patch-ios-viewcontroller: ViewController.swift not found, skip');
  process.exit(0);
}

let vc = fs.readFileSync(vcPath, 'utf8');

if (vc.includes('configureWebView')) {
  console.log('patch-ios-viewcontroller: already patched');
  process.exit(0);
}

vc = vc.replace(
  'import Capacitor',
  'import Capacitor\nimport WebKit'
);

const patched = `class ViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        configureWebView()
    }

    private func configureWebView() {
        guard let wv = webView else { return }
        wv.configuration.preferences.javaScriptEnabled = true
        if #available(iOS 14.0, *) {
            wv.configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        }
        wv.configuration.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        wv.configuration.setValue(true, forKey: "allowUniversalAccessFromFileURLs")
        wv.configuration.websiteDataStore = WKWebsiteDataStore.default()
        wv.configuration.processPool = WKProcessPool()
    }
}`;

vc = vc.replace(/class ViewController: CAPBridgeViewController \{[\s\S]*?\n\}/, patched);
fs.writeFileSync(vcPath, vc, 'utf8');
console.log('patch-ios-viewcontroller: WKWebView configuration patched');
