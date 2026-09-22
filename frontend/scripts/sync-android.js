/**
 * Sync the built web app into the Android project.
 *
 * Capacitor copies everything in `dist/` into the APK's assets. The
 * downloadable APK lives in `public/`, so Vite copies it into `dist/` and it
 * would end up bundled inside the next APK — each build embedding the previous
 * one. It is stripped from the Android assets here, after the sync, so `dist/`
 * keeps its copy for the web download page.
 *
 * Run: node scripts/sync-android.js
 */
import { execSync } from 'child_process';
import { readdirSync, rmSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const assetsPublic = resolve(root, 'android', 'app', 'src', 'main', 'assets', 'public');

execSync('npx cap sync android', { cwd: root, stdio: 'inherit' });

if (existsSync(assetsPublic)) {
  const stray = readdirSync(assetsPublic).filter((f) => f.toLowerCase().endsWith('.apk'));
  for (const file of stray) {
    rmSync(join(assetsPublic, file));
    console.log(`✅ Removed ${file} from Android assets (prevents APK-in-APK nesting)`);
  }
  if (stray.length === 0) {
    console.log('✅ No stray APKs in Android assets');
  }
}
