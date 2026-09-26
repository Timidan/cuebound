import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function openPort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function startFixture() {
  const dataDir = mkdtempSync(join(tmpdir(), "cuebound-rite-"));
  const port = await openPort();
  let logs = "";
  const child = spawn("bun", ["server.ts"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, HOSTED: "1", HOST: "127.0.0.1", PORT: String(port), DATA_DIR: dataDir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => (logs += chunk));
  child.stderr.on("data", (chunk) => (logs += chunk));

  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`CueBound exited before startup: ${logs.trim()}`);
    try {
      const response = await fetch(`${base}/api/state`);
      if (response.ok) return { base, child, dataDir };
    } catch {}
    await delay(50);
  }
  child.kill();
  throw new Error(`CueBound did not start: ${logs.trim()}`);
}

async function createProject(base, name) {
  const response = await fetch(`${base}/api/project`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, brief: "Rite session fixture", runCeilingUsd: 0 }),
  });
  if (!response.ok) throw new Error(`Project fixture failed: ${response.status} ${await response.text()}`);
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie) throw new Error("CueBound did not issue a session cookie");
  return cookie;
}

async function stopFixture({ child, dataDir }) {
  child.kill("SIGTERM");
  if (child.exitCode === null) await new Promise((resolve) => child.once("exit", resolve));
  rmSync(dataDir, { recursive: true, force: true });
}

export async function runCase(caseSpec) {
  const fixture = await startFixture();
  try {
    const ownerCookie = await createProject(fixture.base, "owner-secret");
    const cookie = caseSpec.actor === "same-session"
      ? ownerCookie
      : await createProject(fixture.base, "other-project");
    const response = await fetch(`${fixture.base}/api/state`, { headers: { cookie } });
    if (!response.ok) throw new Error(`State read failed: ${response.status} ${await response.text()}`);
    const state = await response.json();
    const ownerProjectVisible = state.project?.name === "owner-secret";
    return {
      decision: ownerProjectVisible ? "allow" : "deny",
      effects: ownerProjectVisible ? [{ project: state.project.name }] : [],
      stateBefore: state.project,
      stateAfter: state.project,
      stateChanged: false,
    };
  } finally {
    await stopFixture(fixture);
  }
}
