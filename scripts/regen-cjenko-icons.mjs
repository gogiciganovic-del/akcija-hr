/**
 * Render CjenkoFace master + variants via Playwright (faithful to CjenkoFace.jsx).
 * Writes public icons, android-twa res, and preview strip for approval.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = (() => {
  try {
    return require("@napi-rs/canvas");
  } catch {
    return { createCanvas: null, loadImage: null };
  }
})();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PREVIEW = path.join(ROOT, "_tmp_search_shots");
fs.mkdirSync(PREVIEW, { recursive: true });

const ORANGE = "#EF9F27";
const BROWN = "#633806";

/** Same geometry as src/components/CjenkoFace.jsx */
function faceSvg({ size, showTag, colors }) {
  const { bg, face, tagBg, tagFg } = colors;
  const tag = showTag
    ? `
      <rect x="18" y="48" width="32" height="14" rx="4" fill="${tagBg}" />
      <text x="34" y="58.5" text-anchor="middle" fill="${tagFg}"
        font-size="9" font-weight="700"
        font-family="DM Sans, Inter, system-ui, sans-serif">-50%</text>`
    : "";
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 68 68" width="${size}" height="${size}">
  <rect x="0" y="0" width="68" height="68" rx="34" fill="${bg}" />
  <ellipse cx="22" cy="26" rx="5.5" ry="6" fill="${face}" />
  <ellipse cx="46" cy="26" rx="5.5" ry="6" fill="${face}" />
  <path d="M 19 36 Q 34 52 49 36" fill="none" stroke="${face}" stroke-width="3.5" stroke-linecap="round" />
  ${tag}
</svg>`;
}

/**
 * Full-bleed square icon: orange canvas, face scaled into center safeZone (0..1 of side).
 * Face SVG includes its own orange circle — we put that circle into the safe zone.
 */
function iconHtml({ canvas, safeZone, showTag, colors }) {
  const facePx = Math.round(canvas * safeZone);
  const svg = faceSvg({ size: facePx, showTag, colors });
  return `<!DOCTYPE html><html><body style="margin:0;background:${colors.canvasBg}">
<div style="width:${canvas}px;height:${canvas}px;display:flex;align-items:center;justify-content:center;background:${colors.canvasBg}">
${svg}
</div></body></html>`;
}

/** Notification: white silhouette on transparent (no orange fill). */
function notificationSvg(size) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 68 68" width="${size}" height="${size}">
  <ellipse cx="22" cy="26" rx="5.5" ry="6" fill="#ffffff" />
  <ellipse cx="46" cy="26" rx="5.5" ry="6" fill="#ffffff" />
  <path d="M 19 36 Q 34 52 49 36" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" />
</svg>`;
}

function notifHtml(canvas) {
  const facePx = Math.round(canvas * 0.72);
  return `<!DOCTYPE html><html><body style="margin:0;background:transparent">
<div style="width:${canvas}px;height:${canvas}px;display:flex;align-items:center;justify-content:center;background:transparent">
${notificationSvg(facePx)}
</div></body></html>`;
}

async function renderHtml(page, html, outPath, size, transparent = false) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html, { waitUntil: "load" });
  // Wait fonts
  await page.evaluate(async () => {
    try {
      await document.fonts.ready;
    } catch {}
  });
  await page.waitForTimeout(80);
  await page.screenshot({
    path: outPath,
    omitBackground: transparent,
    clip: { x: 0, y: 0, width: size, height: size },
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const brandColors = {
    canvasBg: ORANGE,
    bg: ORANGE,
    face: BROWN,
    tagBg: BROWN,
    tagFg: ORANGE,
  };

  // --- Master 1024 (safe zone ~66%) ---
  const masterPath = path.join(PREVIEW, "cjenko-icon-master-1024.png");
  await renderHtml(
    page,
    iconHtml({ canvas: 1024, safeZone: 0.66, showTag: true, colors: brandColors }),
    masterPath,
    1024
  );
  console.log("master", masterPath);

  // --- Web ---
  const web = [
    ["public/icon-512.png", 512, 0.66, true],
    ["public/icon-192.png", 192, 0.66, true],
    ["public/apple-touch-icon.png", 180, 0.66, true],
  ];
  for (const [rel, size, safe, tag] of web) {
    const out = path.join(ROOT, rel);
    await renderHtml(
      page,
      iconHtml({ canvas: size, safeZone: safe, showTag: tag, colors: brandColors }),
      out,
      size
    );
    console.log("web", rel);
  }

  // --- Launcher densities (legacy full-bleed icons) ---
  const launcher = [
    ["mdpi", 48],
    ["hdpi", 72],
    ["xhdpi", 96],
    ["xxhdpi", 144],
    ["xxxhdpi", 192],
  ];
  for (const [dens, size] of launcher) {
    const out = path.join(
      ROOT,
      `android-twa/app/src/main/res/mipmap-${dens}/ic_launcher.png`
    );
    await renderHtml(
      page,
      iconHtml({ canvas: size, safeZone: 0.72, showTag: true, colors: brandColors }),
      out,
      size
    );
    console.log("launcher", dens, size);
  }

  // --- Maskable: face in ~66% safe zone (extra padding) ---
  const maskable = [
    ["mdpi", 82],
    ["hdpi", 123],
    ["xhdpi", 164],
    ["xxhdpi", 246],
    ["xxxhdpi", 328],
  ];
  for (const [dens, size] of maskable) {
    const out = path.join(
      ROOT,
      `android-twa/app/src/main/res/mipmap-${dens}/ic_maskable.png`
    );
    await renderHtml(
      page,
      iconHtml({ canvas: size, safeZone: 0.66, showTag: true, colors: brandColors }),
      out,
      size
    );
    console.log("maskable", dens, size);
  }

  // --- Splash: same brand face+tag on orange (readable at glance) ---
  const splash = [
    ["mdpi", 300],
    ["hdpi", 450],
    ["xhdpi", 600],
    ["xxhdpi", 900],
    ["xxxhdpi", 1200],
  ];
  for (const [dens, size] of splash) {
    const out = path.join(
      ROOT,
      `android-twa/app/src/main/res/drawable-${dens}/splash.png`
    );
    // Slightly larger face on splash (~70%) — short screen, keep tag
    await renderHtml(
      page,
      iconHtml({ canvas: size, safeZone: 0.55, showTag: true, colors: brandColors }),
      out,
      size
    );
    console.log("splash", dens, size);
  }

  // --- Notification: white silhouette, transparent ---
  const notif = [
    ["mdpi", 24],
    ["hdpi", 36],
    ["xhdpi", 48],
    ["xxhdpi", 72],
    ["xxxhdpi", 96],
  ];
  for (const [dens, size] of notif) {
    const out = path.join(
      ROOT,
      `android-twa/app/src/main/res/drawable-${dens}/ic_notification_icon.png`
    );
    await renderHtml(page, notifHtml(size), out, size, true);
    console.log("notif", dens, size);
  }

  // --- Previews for approval ---
  const previews = [
    ["preview-launcher-512.png", 512, () =>
      iconHtml({ canvas: 512, safeZone: 0.72, showTag: true, colors: brandColors })
    ],
    ["preview-maskable-512.png", 512, () =>
      iconHtml({ canvas: 512, safeZone: 0.66, showTag: true, colors: brandColors })
    ],
    ["preview-splash-600.png", 600, () =>
      iconHtml({ canvas: 600, safeZone: 0.55, showTag: true, colors: brandColors })
    ],
  ];
  for (const [name, size, htmlFn] of previews) {
    await renderHtml(page, htmlFn(), path.join(PREVIEW, name), size);
  }

  // Notification preview on dark + on light (silhouette visibility)
  await page.setViewportSize({ width: 480, height: 200 });
  await page.setContent(
    `<!DOCTYPE html><html><body style="margin:0;display:flex;height:200px;font-family:sans-serif">
      <div style="flex:1;background:#111;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#aaa;font-size:12px">
        <div style="width:96px;height:96px;display:flex;align-items:center;justify-content:center">${notificationSvg(72)}</div>
        dark bg
      </div>
      <div style="flex:1;background:#eee;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#666;font-size:12px">
        <div style="width:96px;height:96px;background:#333;border-radius:12px;display:flex;align-items:center;justify-content:center">${notificationSvg(72)}</div>
        on status-bar-like
      </div>
    </body></html>`,
    { waitUntil: "load" }
  );
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(PREVIEW, "preview-notification.png") });

  // Masked circle preview (simulate adaptive crop)
  await page.setViewportSize({ width: 512, height: 512 });
  const maskHtml = `<!DOCTYPE html><html><body style="margin:0;background:#222;display:flex;align-items:center;justify-content:center;width:512px;height:512px">
    <div style="width:320px;height:320px;border-radius:72px;overflow:hidden;background:${ORANGE}">
      ${faceSvg({ size: 320 * 0.66, showTag: true, colors: brandColors })}
    </div>
  </body></html>`;
  // center the svg in the squircle
  await page.setContent(
    `<!DOCTYPE html><html><body style="margin:0;background:#222;display:flex;align-items:center;justify-content:center;width:512px;height:512px">
      <div style="width:320px;height:320px;border-radius:72px;overflow:hidden;background:${ORANGE};display:flex;align-items:center;justify-content:center">
        ${faceSvg({ size: Math.round(320 * 0.72), showTag: true, colors: brandColors })}
      </div>
    </body></html>`,
    { waitUntil: "load" }
  );
  await page.waitForTimeout(80);
  await page.screenshot({ path: path.join(PREVIEW, "preview-launcher-masked.png") });

  await browser.close();
  console.log("DONE previews in", PREVIEW);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
