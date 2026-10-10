// html → PDF через headless Chrome (протокол CDP). node html2pdf.mjs in.html out.pdf
// Печать с фонами (тёмный дизайн), размер страницы — из CSS @page документа.
// node html2pdf.mjs in.html out_dir --png — по картинке на каждый .slide (проверить вёрстку глазами).
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

const CHROME = "/srv/easylife-chat-agent/easylife-montage/studio/node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell";
const [, , inp, out] = process.argv;
if (!inp || !out) { console.error("usage: node html2pdf.mjs in.html out.pdf | out_dir --png"); process.exit(2); }
const PNG = process.argv.includes("--png");
const port = 9300 + Math.floor(Math.random() * 600);
const prof = mkdtempSync(join(tmpdir(), "pdfprof-"));
const chrome = spawn(CHROME, ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", `--user-data-dir=${prof}`,
  `--remote-debugging-port=${port}`, "--remote-allow-origins=*", "about:blank"], { stdio: "ignore" });
const kill = () => { try { chrome.kill("SIGKILL"); } catch {} try { rmSync(prof, { recursive: true, force: true }); } catch {} };
const timer = setTimeout(() => { console.error("timeout"); kill(); process.exit(1); }, 90000);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

try {
  let targets = null;
  for (let i = 0; i < 60 && !targets; i++) { await sleep(250); try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch {} }
  const page = targets.find(t => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const waiters = new Map(); const events = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && waiters.has(d.id)) { waiters.get(d.id)(d); waiters.delete(d.id); } else if (d.method) events.push(d.method); };
  const send = (method, params = {}) => new Promise(r => { const n = ++id; waiters.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  await send("Page.enable");
  await send("Page.navigate", { url: "file://" + resolve(inp) });
  for (let i = 0; i < 120 && !events.includes("Page.loadEventFired"); i++) await sleep(250);
  await sleep(1500); // шрифты Google Fonts и раскладка
  if (PNG) {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(out, { recursive: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await sleep(500);
    const r = await send("Runtime.evaluate", { expression: "JSON.stringify([...document.querySelectorAll('.slide')].map(e=>{const b=e.getBoundingClientRect();return [b.left+scrollX,b.top+scrollY,b.width,b.height]}))", returnByValue: true });
    const boxes = JSON.parse(r.result?.result?.value || "[]");
    for (let i = 0; i < boxes.length; i++) {
      const [x, y, w, h] = boxes[i];
      const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x, y, width: w, height: h, scale: 0.6 } });
      writeFileSync(join(out, `slide_${String(i + 1).padStart(2, "0")}.png`), Buffer.from(shot.result.data, "base64"));
    }
    console.log("ok", boxes.length, "slides →", out);
    clearTimeout(timer); ws.close(); kill(); process.exit(0);
  }
  const res = await send("Page.printToPDF", { printBackground: true, preferCSSPageSize: true, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 });
  if (!res.result?.data) throw new Error(JSON.stringify(res.error || res).slice(0, 300));
  writeFileSync(out, Buffer.from(res.result.data, "base64"));
  console.log("ok", out);
  clearTimeout(timer); ws.close(); kill(); process.exit(0);
} catch (e) { console.error("fail", e?.message || e); clearTimeout(timer); kill(); process.exit(1); }
