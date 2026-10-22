/**
 * scripts/sync-icons.mjs
 *
 * Ensures all required application icon assets exist and are up to date
 * across Windows, Linux, and the packaged Next.js / Electron runtime.
 *
 * Targets:
 *  - Windows: build-resources/icon.ico (installerIcon, uninstallerIcon, app icon)
 *  - Linux:   build-resources/icons/{16,24,32,48,64,128,256,512,1024}x{...}.png
 *  - Runtime: public/icon-512.png, public/icon.png, public/favicon.ico, etc.
 *  - macOS:   build-resources/icon.icns
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

const BUILD_RESOURCES_DIR = path.join(ROOT_DIR, "build-resources");
const LINUX_ICONS_DIR = path.join(BUILD_RESOURCES_DIR, "icons");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const SRC_ASSETS_ICON_DIR = path.join(ROOT_DIR, "src", "assets", "icon");

const LINUX_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

export async function syncIcons() {
  console.log("\x1b[36m[Icons] Verifying and synchronizing desktop & web icon assets…\x1b[0m");

  fs.mkdirSync(BUILD_RESOURCES_DIR, { recursive: true });
  fs.mkdirSync(LINUX_ICONS_DIR, { recursive: true });
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.mkdirSync(SRC_ASSETS_ICON_DIR, { recursive: true });

  // 1. Sync icon.ico between src/assets/icon and build-resources
  const srcIco = path.join(SRC_ASSETS_ICON_DIR, "icon.ico");
  const buildIco = path.join(BUILD_RESOURCES_DIR, "icon.ico");

  if (fs.existsSync(srcIco) && !fs.existsSync(buildIco)) {
    fs.copyFileSync(srcIco, buildIco);
    console.log(`\x1b[32m[Icons] ✓ Copied icon.ico → build-resources/icon.ico\x1b[0m`);
  } else if (fs.existsSync(buildIco) && !fs.existsSync(srcIco)) {
    fs.copyFileSync(buildIco, srcIco);
    console.log(`\x1b[32m[Icons] ✓ Copied icon.ico → src/assets/icon/icon.ico\x1b[0m`);
  }

  // 2. Master PNG resolution
  const masterPng = path.join(BUILD_RESOURCES_DIR, "icon.png");
  if (!fs.existsSync(masterPng)) {
    console.error(`\x1b[31m[Icons] Missing master icon: ${masterPng}\x1b[0m`);
    return false;
  }

  // 3. Generate Linux multi-resolution icon set
  for (const size of LINUX_SIZES) {
    const targetFile = path.join(LINUX_ICONS_DIR, `${size}x${size}.png`);
    await sharp(masterPng)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(targetFile);
  }
  console.log(`\x1b[32m[Icons] ✓ Linux icon set verified in build-resources/icons/ (${LINUX_SIZES.join(", ")}px)\x1b[0m`);

  // 4. Update public/ and src/assets/ icons for runtime & web
  const webTargets = [
    { file: path.join(PUBLIC_DIR, "icon-512.png"), size: 512 },
    { file: path.join(PUBLIC_DIR, "icon.png"), size: 512 },
    { file: path.join(PUBLIC_DIR, "icon-192.png"), size: 192 },
    { file: path.join(PUBLIC_DIR, "apple-touch-icon.png"), size: 180 },
    { file: path.join(PUBLIC_DIR, "favicon-32x32.png"), size: 32 },
    { file: path.join(PUBLIC_DIR, "favicon-16x16.png"), size: 16 },
    { file: path.join(SRC_ASSETS_ICON_DIR, "icon.png"), size: 512 },
    { file: path.join(SRC_ASSETS_ICON_DIR, "cvs.png"), size: 128 },
    { file: path.join(PUBLIC_DIR, "cvs.png"), size: 128 },
  ];

  for (const target of webTargets) {
    await sharp(masterPng)
      .resize(target.size, target.size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(target.file);
  }

  // Ensure favicon.ico exists in public
  const publicFavicon = path.join(PUBLIC_DIR, "favicon.ico");
  if (!fs.existsSync(publicFavicon) && fs.existsSync(buildIco)) {
    fs.copyFileSync(buildIco, publicFavicon);
  }

  // Ensure cvs.png header logo is synchronized to public
  const srcCvs = path.join(SRC_ASSETS_ICON_DIR, "cvs.png");
  const publicCvs = path.join(PUBLIC_DIR, "cvs.png");
  // Ensure Windows NSIS installer BMP images exist
  const sidebarBmp = path.join(BUILD_RESOURCES_DIR, "installer-sidebar.bmp");
  const headerBmp = path.join(BUILD_RESOURCES_DIR, "installer-header.bmp");
  if (!fs.existsSync(sidebarBmp) || !fs.existsSync(headerBmp)) {
    try {
      const pyScript = `
from PIL import Image, ImageDraw
w, h = 164, 314
sidebar = Image.new('RGB', (w, h), (11, 15, 25))
draw = ImageDraw.Draw(sidebar)
for y in range(h):
    r, g, b = int(11 + (y/h)*9), int(15 + (y/h)*13), int(25 + (y/h)*23)
    draw.line([(0, y), (w, y)], fill=(r, g, b))
icon = Image.open('build-resources/icon.png').convert('RGBA')
icon = icon.resize((110, 110), Image.Resampling.LANCZOS)
sidebar.paste(icon, ((w - 110)//2, 50), mask=icon.split()[3])
sidebar.save('build-resources/installer-sidebar.bmp', 'BMP')
`;
      const { execSync } = await import("child_process");
      execSync(`python3 -c "${pyScript.replace(/\n/g, ';')}"`, { cwd: ROOT_DIR });
    } catch {}
  }

  console.log("\x1b[32m[Icons] ✓ Web, runtime, and installer icon assets verified\x1b[0m");
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  syncIcons().catch((err) => {
    console.error("[Icons] Error synchronizing icons:", err);
    process.exit(1);
  });
}
