const fs = require("fs");
const { spawn } = require("child_process");

const SCRATCH = "C:/Users/hsy42/AppData/Local/Temp/claude/d------Wendy/82df598b-7563-4bf3-a9d8-641abd6fae96/scratchpad";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PROFILE = SCRATCH + "/chrome_profile_drag";
const PORT = 9335;
const BASE = "http://localhost:8809";
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function waitForDevtools() {
  for (let i = 0; i < 40; i++) {
    try { const res = await fetch(`http://localhost:${PORT}/json/version`); if (res.ok) return; } catch (e) {}
    await sleep(250);
  }
  throw new Error("devtools not ready");
}
class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error))); else resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expr) {
    const result = await this.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error("Eval error: " + JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
}
async function main() {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const sessionObj = JSON.parse(fs.readFileSync(SCRATCH + "/session_obj.json", "utf8"));
  const chromeProc = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, "--no-first-run", "--window-size=1200,900"], { stdio: "ignore" });
  try {
    await waitForDevtools();
    const newTab = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
    const ws = new WebSocket(newTab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener("open", resolve); ws.addEventListener("error", reject); });
    const cdp = new CDP(ws);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
    const seedScript = `localStorage.setItem(${JSON.stringify("sb-dmkvbvzukqtfiwyyphtl-auth-token")}, ${JSON.stringify(JSON.stringify(sessionObj))});`;
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: seedScript });
    await cdp.send("Page.navigate", { url: `${BASE}/calendar.html` });
    await sleep(2500);

    // 첫 번째 주(outside 포함 X)의 실제 이번 달 날짜 두 칸의 중심 좌표를 계산
    const cellInfo = await cdp.eval(`(() => {
      const cells = Array.from(document.querySelectorAll('.calendar-cell:not(.outside)'));
      const startCell = cells[3];
      const endCell = cells[6];
      const r1 = startCell.getBoundingClientRect();
      const r2 = endCell.getBoundingClientRect();
      return {
        startDate: startCell.dataset.date,
        endDate: endCell.dataset.date,
        x1: r1.x + r1.width/2, y1: r1.y + r1.height/2,
        x2: r2.x + r2.width/2, y2: r2.y + r2.height/2,
      };
    })()`);
    console.log("cellInfo", cellInfo);

    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: cellInfo.x1, y: cellInfo.y1, button: "left", clickCount: 1 });
    await sleep(100);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: cellInfo.x2, y: cellInfo.y2, button: "left" });
    await sleep(100);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: cellInfo.x2, y: cellInfo.y2, button: "left" });
    await sleep(500);

    const afterDrag = await cdp.eval(`(() => ({
      addViewHidden: document.getElementById('add-event-view').classList.contains('hidden'),
      rangeHintText: document.getElementById('range-hint').textContent,
      rangeHintHidden: document.getElementById('range-hint').classList.contains('hidden'),
      dateInputDisabled: document.getElementById('event-date').disabled,
      dateInputValue: document.getElementById('event-date').value,
      targets: Array.from(document.querySelectorAll('#calendar-target-list input[type=checkbox]')).map(cb => ({value: cb.value, checked: cb.checked})),
    }))()`);
    console.log("afterDrag", JSON.stringify(afterDrag, null, 2));

    await cdp.eval(`document.getElementById('event-title').value = 'Drag Test Event'; null`);
    await cdp.eval(`document.getElementById('save-event-btn').click(); null`);
    await sleep(1200);

    const afterSave = await cdp.eval(`(() => ({
      calendarViewHidden: document.getElementById('calendar-view').classList.contains('hidden'),
    }))()`);
    console.log("afterSave", afterSave);
    console.log("EXPECT_DATES", JSON.stringify({ from: cellInfo.startDate, to: cellInfo.endDate }));
  } finally {
    chromeProc.kill();
  }
}
main().catch((err) => { console.error("FATAL:", err); process.exit(1); });
