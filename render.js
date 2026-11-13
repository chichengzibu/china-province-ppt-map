// 渲染：常规版 + 仅省份透明版；并生成配色方案展示（吉林省 × 全部调色板）
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const dir = __dirname;
const url = "file://" + path.join(dir, "index.html");
const codes = [
  { code: "220000", name: "吉林省" },
  { code: "230000", name: "黑龙江省" },
  { code: "120000", name: "天津市" },
  { code: "310000", name: "上海市" }
];

async function grab(page, scale) {
  return await page.evaluate((sc) => {
    const VIEW_W = 1200, VIEW_H = 900;
    const svg = document.getElementById("map");
    const clone = svg.cloneNode(true);
    clone.setAttribute("width", VIEW_W);
    clone.setAttribute("height", VIEW_H);
    const xml = new XMLSerializer().serializeToString(clone);
    const src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = VIEW_W * sc; c.height = VIEW_H * sc;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/png"));
      };
      img.onerror = () => reject(new Error("SVG 渲染失败"));
      img.src = src;
    });
  }, scale);
}

async function setMode(page, code, po) {
  await page.evaluate((args) => {
    const s = document.getElementById("prov"); s.value = args.c; s.dispatchEvent(new Event("change"));
    const cb = document.getElementById("provOnly"); cb.checked = args.po; cb.dispatchEvent(new Event("change"));
  }, { c: code, po: po });
  await page.waitForTimeout(250);
}
async function setStyle(page, prov, palette, mode, po) {
  await page.evaluate((a) => {
    document.getElementById("prov").value = a.prov; document.getElementById("prov").dispatchEvent(new Event("change"));
    document.getElementById("palette").value = a.palette; document.getElementById("palette").dispatchEvent(new Event("change"));
    document.getElementById("colorMode").value = a.mode; document.getElementById("colorMode").dispatchEvent(new Event("change"));
    const cb = document.getElementById("provOnly"); cb.checked = a.po; cb.dispatchEvent(new Event("change"));
  }, { prov, palette, mode, po });
  await page.waitForTimeout(250);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(url, { waitUntil: "networkidle" });

  // 1) 四省常规版 + 仅省份透明版
  for (const item of codes) {
    await setMode(page, item.code, false);
    let d = await grab(page, 2);
    fs.writeFileSync(path.join(dir, "output", item.name + "_2.5D.png"), Buffer.from(d.split(",")[1], "base64"));
    console.log("saved normal:", item.name);
    await setMode(page, item.code, true);
    d = await grab(page, 2);
    fs.writeFileSync(path.join(dir, "output", item.name + "_省份透明.png"), Buffer.from(d.split(",")[1], "base64"));
    console.log("saved province-only:", item.name);
  }

  // 2) 配色展示：吉林省 × 全部调色板（渐变·水平），存到 preview/
  const palVals = await page.evaluate(() =>
    Array.from(document.getElementById("palette").options).map(o => ({ v: o.value, t: o.textContent })));
  const previewDir = path.join(dir, "preview");
  fs.mkdirSync(previewDir, { recursive: true });
  for (const p of palVals) {
    await setStyle(page, "220000", p.v, "h", false);
    const d = await grab(page, 2);
    fs.writeFileSync(path.join(previewDir, "吉林省_" + p.v + ".png"), Buffer.from(d.split(",")[1], "base64"));
    console.log("preview:", p.t);
  }

  if (errors.length) console.log("PAGE ERRORS:", errors);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
