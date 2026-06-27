// Sandboxed build worker. Spawned as a separate process by sandbox.ts under OS resource limits (CPU/memory/
// file size) + a hard wall-clock timeout. Reads a CompileRequest as JSON on stdin, runs the build, writes the
// CompileResponse as JSON on stdout. Isolating the build here means a malicious/pathological source can only
// exhaust this short-lived child — which the parent caps and kills — never the API server.
import { runBuild } from "./buildcore";
import type { CompileRequest, CompileResponse } from "./buildtypes";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  let res: CompileResponse;
  try {
    const req = JSON.parse(await readStdin()) as CompileRequest;
    res = await runBuild(req);
  } catch (e) {
    res = { ok: false, diagnostics: [], error: (e as Error).message };
  }

  // Await the flush before returning: process.exit() drops un-flushed stdout, so a large result (e.g. a big
  // contract's wasm base64) would be truncated and reach the parent as "exited 0 with no result".
  await new Promise<void>((resolve, reject) => {
    process.stdout.write(JSON.stringify(res), (err) => (err ? reject(err) : resolve()));
  });
}

void main().then(() => process.exit(0));
