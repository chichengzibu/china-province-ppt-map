// 截取带工具栏的完整程序界面，用于 README 展示
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const dir = __dirname;
const url = "file://" + path.join(dir, "index.html");
const shotDir = path.join(dir, "screenshots");
fs.mkdirSync(shotDir, { recursive: true });

async function setUI(page, o) {
  await page.evaluate((a) => {
    if (a.prov) { document.getElementById("prov").value = a.prov; document.getElementById("prov").dispatchEvent(new Event("change")); }
    if (a.palette) { document.getElementById("palette").value = a.palette; document.getElementById("palette").dispatchEvent(new Event("change")); }
    if (a.mode) { document.getElementById("colorMode").value = a.mode; document.getElementById("colorMode").dispatchEvent(new Event("change")); }
    const cb = document.getElementById("provOnly");
    cb.checked = !!a.po; cb.dispatchEvent(new Event("change"));
  }, o);
  await page.waitForTimeout(350);
}

(async () => {
  const browser = await chromium.launch();
  // 宽视口保证顶部工具栏一行排布，界面完整
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "networkidle" });

  // 1) 默认界面：辽宁省 + 科技蓝 + 水平渐变（完整功能态）
  await setUI(page, { prov: "210000", palette: "tech-blue", mode: "h", po: false });
  await page.screenshot({ path: path.join(shotDir, "01-ui-default-liaoning.png") });
  console.log("saved 01-ui-default-liaoning.png");

  // 2) 换配色：吉林省 + 霞光
  await setUI(page, { prov: "220000", palette: "sunset", mode: "h", po: false });
  await page.screenshot({ path: path.join(shotDir, "02-ui-palette-sunset-jilin.png") });
  console.log("saved 02-ui-palette-sunset-jilin.png");

  // 3) 仅省份透明底模式：上海市
  await setUI(page, { prov: "310000", palette: "tech-blue", mode: "h", po: true });
  await page.screenshot({ path: path.join(shotDir, "03-ui-province-only-shanghai.png") });
  console.log("saved 03-ui-province-only-shanghai.png");

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
