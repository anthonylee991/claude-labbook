/**
 * Cross-platform IPC socket path computation.
 * Windows: named pipe \\.\pipe\labbook-{hash}
 * Unix/macOS: /tmp/labbook-{hash}.sock
 */

import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function getIpcPath(labbookDir: string): string {
  const hash = createHash("sha256")
    .update(labbookDir.replace(/\\/g, "/").toLowerCase())
    .digest("hex")
    .substring(0, 16);

  if (process.platform === "win32") {
    return `\\\\.\\pipe\\labbook-${hash}`;
  }
  return join(tmpdir(), `labbook-${hash}.sock`);
}
