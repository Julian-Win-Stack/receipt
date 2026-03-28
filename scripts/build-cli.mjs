import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");
const cliOutfile = path.join(distDir, "cli.js");
const cliLauncherOutfile = path.join(distDir, "receipt");
const serverOutfile = path.join(distDir, "server.js");
const agentOutdir = path.join(distDir, "agent-routes");

await fs.mkdir(distDir, { recursive: true });

await build({
  entryPoints: [path.join(rootDir, "src", "cli.ts")],
  outfile: cliOutfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: false,
  alias: {
    "react-devtools-core": path.join(rootDir, "scripts", "shims", "react-devtools-core.js"),
  },
  banner: {
    js: [
      "#!/usr/bin/env bun",
      "import { createRequire as __createRequire } from 'node:module';",
      "const require = __createRequire(import.meta.url);",
    ].join("\n"),
  },
  legalComments: "none",
});

await build({
  entryPoints: [path.join(rootDir, "src", "server.ts")],
  outfile: serverOutfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: false,
  alias: {
    "react-devtools-core": path.join(rootDir, "scripts", "shims", "react-devtools-core.js"),
  },
  legalComments: "none",
});

const agentSourceDir = path.join(rootDir, "src", "agents");
const agentEntryPoints = (await fs.readdir(agentSourceDir, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith(".agent.ts"))
  .map((entry) => path.join(agentSourceDir, entry.name));

if (agentEntryPoints.length > 0) {
  await build({
    entryPoints: agentEntryPoints,
    outdir: agentOutdir,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    sourcemap: false,
    entryNames: "[name]",
    alias: {
      "react-devtools-core": path.join(rootDir, "scripts", "shims", "react-devtools-core.js"),
    },
    legalComments: "none",
  });
}

const built = await fs.readFile(cliOutfile, "utf-8");
const normalized = built.replace(/^(?:#![^\n]*\r?\n)+/, "#!/usr/bin/env bun\n");
if (normalized !== built) {
  await fs.writeFile(cliOutfile, normalized, "utf-8");
}

const launcher = [
  "#!/usr/bin/env sh",
  "set -eu",
  "",
  "if ! command -v bun >/dev/null 2>&1; then",
  "  echo \"error: Bun runtime is required to run receipt. Install Bun from https://bun.sh/docs/installation and retry.\" >&2",
  "  exit 1",
  "fi",
  "",
  "SOURCE=\"$0\"",
  "while [ -h \"$SOURCE\" ]; do",
  "  DIR=$(CDPATH= cd -- \"$(dirname -- \"$SOURCE\")\" && pwd)",
  "  TARGET=$(readlink \"$SOURCE\")",
  "  case \"$TARGET\" in",
  "    /*) SOURCE=\"$TARGET\" ;;",
  "    *) SOURCE=\"$DIR/$TARGET\" ;;",
  "  esac",
  "done",
  "SCRIPT_DIR=$(CDPATH= cd -- \"$(dirname -- \"$SOURCE\")\" && pwd)",
  "exec bun \"$SCRIPT_DIR/cli.js\" \"$@\"",
  "",
].join("\n");
await fs.writeFile(cliLauncherOutfile, launcher, "utf-8");

await fs.chmod(cliOutfile, 0o755);
await fs.chmod(cliLauncherOutfile, 0o755);
console.log(`built ${path.relative(rootDir, cliOutfile)}`);
console.log(`built ${path.relative(rootDir, cliLauncherOutfile)}`);
console.log(`built ${path.relative(rootDir, serverOutfile)}`);
if (agentEntryPoints.length > 0) {
  console.log(`built ${path.relative(rootDir, agentOutdir)}`);
}
