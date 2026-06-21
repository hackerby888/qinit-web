// Headless-Chrome e2e smoke for the IDE: load /ide, create a project (through the splash), and assert the
// Monaco editor mounts and the toolbar renders. Proves the full frontend+backend stack serves and the editor
// runs. Run against a chrome with --remote-debugging-port=9222 and the app on BASE (default localhost:4173).
//   bun scripts/e2e/ide-smoke.mjs [base]
const BASE = process.argv[2] || "http://localhost:4173";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ver = await (await fetch("http://127.0.0.1:9222/json/version")).json();

function connect(u) {
  const ws = new WebSocket(u);
  const w = new Map();
  let id = 0;
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && w.has(m.id)) {
      const x = w.get(m.id);
      w.delete(m.id);
      m.error ? x.reject(new Error(JSON.stringify(m.error))) : x.resolve(m.result);
    }
  };
  const ready = new Promise((r) => (ws.onopen = r));
  const send = (me, p = {}, s) =>
    new Promise((res, rej) => {
      const mid = ++id;
      w.set(mid, { resolve: res, reject: rej });
      ws.send(JSON.stringify({ id: mid, method: me, params: p, sessionId: s }));
    });
  return { ws, ready, send };
}

const c = connect(ver.webSocketDebuggerUrl);
await c.ready;
const { targetId } = await c.send("Target.createTarget", { url: "about:blank" });
const { sessionId: S } = await c.send("Target.attachToTarget", { targetId, flatten: true });
await c.send("Page.enable", {}, S);
await c.send("Runtime.enable", {}, S);

const ev = async (x) => {
  const r = await c.send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }, S);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const txt = () => ev("document.body.innerText");
const editorMounted = () => ev(`!!document.querySelector('.monaco-editor .view-lines')`);

await c.send("Page.navigate", { url: `${BASE}/ide` }, S);
for (let i = 0; i < 60; i++) {
  if (/New project/i.test(await txt())) break;
  await sleep(250);
}
const galleryOk = /New project/i.test(await txt());

await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/New project/i.test(x.textContent));b&&b.click();})()`);
for (let i = 0; i < 60; i++) {
  if (await editorMounted()) break;
  await sleep(250);
}
const mounted = await editorMounted();
const body = await txt();

const checks = {
  gallery: galleryOk,
  editor: mounted,
  toolbar: /Compile & Run/i.test(body),
};
console.log("e2e checks:", JSON.stringify(checks));
const pass = Object.values(checks).every(Boolean);
console.log("RESULT:", pass ? "PASS" : "FAIL");
c.ws.close();
process.exit(pass ? 0 : 1);
