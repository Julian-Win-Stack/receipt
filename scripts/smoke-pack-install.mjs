import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const rootDir = process.cwd();
const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, "package.json"), "utf-8"));
const packageName = typeof packageJson.name === "string" ? packageJson.name : "";
if (!packageName) {
  throw new Error("package.json name is missing.");
}
const tarballPrefix = `${packageName.replace("@", "").replace("/", "-")}-`;

const run = (command, args, cwd, env = process.env) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with code ${code ?? "null"}`));
    });
  });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForHttp = async (url, timeoutMs) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // Keep polling while server boots.
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${url}`);
};

const stopChild = async (child) => {
  const exited = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  child.kill("SIGTERM");
  const forceTimer = setTimeout(() => {
    child.kill("SIGKILL");
  }, 5_000);
  try {
    await exited;
  } finally {
    clearTimeout(forceTimer);
  }
};

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "receipt-pack-smoke-"));
const installDir = path.join(tempDir, "install-target");

try {
  await run("npm", ["pack"], rootDir);
  const files = await fs.readdir(rootDir);
  const tarball = files
    .filter((name) => name.startsWith(tarballPrefix) && name.endsWith(".tgz"))
    .sort()
    .at(-1);
  if (!tarball) {
    throw new Error(`Unable to find generated ${packageName} tarball.`);
  }

  await fs.mkdir(installDir, { recursive: true });
  await run("npm", ["init", "-y"], installDir);
  await run("git", ["init"], installDir);
  await run("npm", ["install", path.join(rootDir, tarball)], installDir);
  // Use npm exec so command resolution is platform-safe (.cmd on Windows).
  await run("npm", ["exec", "--", "receipt", "help"], installDir);
  await run("npm", ["exec", "--", "receipt", "factory", "init", "--yes"], installDir);
  await run("npm", ["exec", "--", "receipt", "factory", "--json"], installDir);

  const browserPort = "8789";
  const server = spawn("npm", ["exec", "--", "receipt", "dev"], {
    cwd: installDir,
    env: {
      ...process.env,
      PORT: browserPort,
      RECEIPT_DATA_DIR: path.join(installDir, ".receipt", "data"),
      DATA_DIR: path.join(installDir, ".receipt", "data"),
    },
    stdio: "pipe",
  });
  let serverStdout = "";
  let serverStderr = "";
  let serverExitCode = null;
  server.stdout?.setEncoding("utf-8");
  server.stderr?.setEncoding("utf-8");
  server.stdout?.on("data", (chunk) => {
    serverStdout += String(chunk);
  });
  server.stderr?.on("data", (chunk) => {
    serverStderr += String(chunk);
  });
  server.on("exit", (code) => {
    serverExitCode = code;
  });

  try {
    const healthUrl = `http://127.0.0.1:${browserPort}/healthz`;
    const startedAt = Date.now();
    while (Date.now() - startedAt < 45_000) {
      if (serverExitCode !== null) {
        throw new Error([
          `receipt dev exited early with code ${String(serverExitCode)}.`,
          serverStdout ? `stdout:\n${serverStdout}` : "",
          serverStderr ? `stderr:\n${serverStderr}` : "",
        ].filter(Boolean).join("\n\n"));
      }
      try {
        const response = await fetch(healthUrl);
        if (response.ok) break;
      } catch {
        // keep polling
      }
      await sleep(500);
    }
    if (Date.now() - startedAt >= 45_000) {
      throw new Error([
        `Timed out waiting for ${healthUrl}.`,
        serverStdout ? `stdout:\n${serverStdout}` : "",
        serverStderr ? `stderr:\n${serverStderr}` : "",
      ].filter(Boolean).join("\n\n"));
    }
    const factoryResponse = await waitForHttp(`http://127.0.0.1:${browserPort}/factory`, 45_000);
    const factoryHtml = await factoryResponse.text();
    if (!factoryHtml.includes("Factory")) {
      throw new Error("Browser UI smoke failed: /factory did not render expected Factory content.");
    }
  } finally {
    await stopChild(server);
  }
  console.log("pack smoke passed");
} finally {
  // Keep cleanup best-effort so failures still expose primary issue.
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
}
