// Runs `next dev` with its temp files inside the project (.tmp/), not the
// system temp folder: on a machine whose system drive is full, Next's workers
// crash ("Jest worker encountered child process exceptions") when they can't
// write there.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const tmp = join(process.cwd(), ".tmp");
mkdirSync(tmp, { recursive: true });
const env = { ...process.env, TMP: tmp, TEMP: tmp, TMPDIR: tmp, NEXT_TELEMETRY_DISABLED: "1" };
const child = spawn(process.execPath, [join("node_modules", "next", "dist", "bin", "next"), "dev", ...process.argv.slice(2)], { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
