const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const dir = __dirname;
const url = "file://" + path.join(dir, "index.html");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "networkidle" });

  // 1) 验证 SVG 本身（仅省份模式）在角落是否透明
  await page.evaluate(() => {
    const s = document.getElementById("prov"); s.value = "310000"; s.dispatchEvent(new Event("change"));
    const c = document.getElementById("provOnly"); c.checked = true; c.dispatchEvent(new Event("change"));
  });
  await page.waitForTimeout(300);
  const svgRes = await page.evaluate(() => {
    const svg = document.getElementById("map");
    const xml = new XMLSerializer().serializeToString(svg);
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
        const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0);
        const corner = ctx.getImageData(5, 5, 1, 1).data;
        const mapPt = ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height * 0.35), 1, 1).data;
        resolve({ w: c.width, h: c.height, cornerAlpha: corner[3], mapAlpha: mapPt[3] });
      };
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
    });
  });
  console.log("SVG(仅省份) 角落alpha=", svgRes.cornerAlpha, " 地图点alpha=", svgRes.mapAlpha, " size=", svgRes.w + "x" + svgRes.h);

  // 2) 验证已导出的 PNG 文件在角落是否透明
  const pngPath = path.join(dir, "output", "上海市_省份透明.png");
  const b64 = fs.readFileSync(pngPath).toString("base64");
  const pngRes = await page.evaluate((dataUrl) => {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
        const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0);
        const corner = ctx.getImageData(5, 5, 1, 1).data;
        const mapPt = ctx.getImageData(Math.floor(img.width / 2), Math.floor(img.height * 0.35), 1, 1).data;
        resolve({ w: img.width, h: img.height, cornerAlpha: corner[3], mapAlpha: mapPt[3] });
      };
      img.src = dataUrl;
    });
  }, "data:image/png;base64," + b64);
  console.log("PNG文件 角落alpha=", pngRes.cornerAlpha, " 地图点alpha=", pngRes.mapAlpha, " size=", pngRes.w + "x" + pngRes.h);

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
