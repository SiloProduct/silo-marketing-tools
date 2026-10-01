import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { manageService } from "../scripts/service.js";
import { resolveRuntime, launch } from "../scripts/launch.js";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "frame-service-test-"));
  const dataDir = path.join(root, "state");
  fs.mkdirSync(dataDir);
  fs.mkdirSync(path.join(root, "dist"));
  // Windows can retain the stopped child's directory lock briefly.
  t.after(() =>
    fs.promises.rm(root, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    }),
  );
  return { root, dataDir };
}
async function listener(t, reply) {
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(reply));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return server.address().port;
}
async function freePort() {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test("start and stop reject unrelated listeners without removing a live PID", async (t) => {
  const f = fixture(t);
  const pidFile = path.join(f.dataDir, "service.pid");
  fs.writeFileSync(pidFile, String(process.pid));
  const port = await listener(t, { service: "other" });
  for (const action of ["start", "stop"])
    await assert.rejects(
      manageService(action, { ...f, port }),
      /another service/,
    );
  assert.equal(fs.readFileSync(pidFile, "utf8"), String(process.pid));
});

test("ownership includes real app root and data directory", async (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.dataDir, "service.pid"), String(process.pid));
  for (const mismatched of ["appRoot", "stateDir"]) {
    const health = {
      service: "frame",
      apiVersion: 1,
      processId: process.pid,
      appRoot: f.root,
      stateDir: f.dataDir,
    };
    health[mismatched] = os.tmpdir();
    const port = await listener(t, health);
    await assert.rejects(
      manageService("stop", { ...f, port }),
      /another service/,
    );
  }
});

test("an unrelated live PID with no listener is preserved", async (t) => {
  const f = fixture(t);
  const pidFile = path.join(f.dataDir, "service.pid");
  fs.writeFileSync(pidFile, String(process.pid));
  const port = await freePort();
  await assert.rejects(manageService("stop", { ...f, port }), /do not match/);
  assert.equal(fs.readFileSync(pidFile, "utf8"), String(process.pid));
});

test("isolated custom-port service starts, reuses matching PID and stops", async (t) => {
  const f = fixture(t);
  const port = await freePort();
  const serverScript = path.join(f.root, "fake-server.mjs");
  fs.writeFileSync(
    serverScript,
    `import http from 'node:http';
const server = http.createServer((req,res) => { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({service:'frame',apiVersion:1,processId:process.pid,appRoot:process.cwd(),stateDir:process.env.FRAME_DATA_DIR})); });
server.listen(Number(process.env.PORT),'127.0.0.1');
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));`,
  );
  const options = { ...f, port, serverScript };
  t.after(() => {
    const record = path.join(f.dataDir, "service.pid");
    if (fs.existsSync(record)) {
      try {
        process.kill(Number(fs.readFileSync(record, "utf8")), "SIGTERM");
      } catch {}
    }
  });
  assert.match(await manageService("start", options), new RegExp(String(port)));
  const pid = fs.readFileSync(path.join(f.dataDir, "service.pid"), "utf8");
  assert.match(await manageService("start", options), /already running/);
  assert.equal(
    fs.readFileSync(path.join(f.dataDir, "service.pid"), "utf8"),
    pid,
  );
  assert.match(await manageService("stop", options), /stopped/);
  assert.equal(fs.existsSync(path.join(f.dataDir, "service.pid")), false);
});

test("stop removes a dead PID only when no service is listening", async (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.dataDir, "service.pid"), "99999999");
  assert.match(
    await manageService("stop", { ...f, port: await freePort() }),
    /not running/,
  );
  assert.equal(fs.existsSync(path.join(f.dataDir, "service.pid")), false);
});

test("launcher uses the persisted runtime and rejects malformed metadata", (t) => {
  const f = fixture(t);
  assert.equal(resolveRuntime(f.root), process.execPath);
  fs.writeFileSync(
    path.join(f.root, ".frame-runtime.json"),
    JSON.stringify({ nodePath: process.execPath }),
  );
  assert.equal(resolveRuntime(f.root), process.execPath);
  fs.writeFileSync(
    path.join(f.root, ".frame-runtime.json"),
    JSON.stringify({ nodePath: "node" }),
  );
  assert.throws(() => resolveRuntime(f.root), /configuration is invalid/);
});

test("launcher takes the custom URL from a verified CLI result", (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.root, "scripts"));
  fs.writeFileSync(
    path.join(f.root, "scripts/frame.js"),
    `console.log(JSON.stringify({ok:true,data:{service:'frame',url:'http://127.0.0.1:54321'}}));`,
  );
  assert.equal(launch(f.root, { open: false }).url, "http://127.0.0.1:54321");
  fs.writeFileSync(
    path.join(f.root, "scripts/frame.js"),
    `console.error(JSON.stringify({ok:false,error:{message:'Verified startup failed'}}));process.exit(1);`,
  );
  assert.throws(
    () => launch(f.root, { open: false }),
    /Verified startup failed/,
  );
});
