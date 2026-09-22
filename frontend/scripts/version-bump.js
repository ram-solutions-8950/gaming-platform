/**
 * Version Bump Script
 * Increments patch version in package.json, updates src/version.ts,
 * and increments Android build.gradle versionCode & versionName.
 * Run: node scripts/version-bump.js
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(__dirname, '..', 'package.json');
const versionPath = resolve(__dirname, '..', 'src', 'version.ts');
const gradlePath = resolve(__dirname, '..', 'android', 'app', 'build.gradle');

// Read and increment version
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
const parts = pkg.version.split('.').map(Number);
parts[2] = (parts[2] || 0) + 1; // increment patch
pkg.version = parts.join('.');

// Write updated package.json
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// Generate version.ts
const today = new Date().toISOString().split('T')[0];
const versionTs = `// App version — auto-updated by build scripts
export const APP_VERSION = '${pkg.version}';
export const BUILD_DATE = '${today}';
`;
writeFileSync(versionPath, versionTs);

// Update Android build.gradle if it exists
if (existsSync(gradlePath)) {
  let gradle = readFileSync(gradlePath, 'utf-8');
  gradle = gradle.replace(/versionCode\s+(\d+)/, (match, code) => `versionCode ${parseInt(code, 10) + 1}`);
  gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${pkg.version}"`);
  writeFileSync(gradlePath, gradle);
  console.log(`✅ Android build.gradle updated: versionName "${pkg.version}"`);
}

console.log(`✅ Version bumped to ${pkg.version}`);
