import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Every run starts with an empty database. The API creates it again when it starts. */
export default function globalSetup() {
  rmSync(fileURLToPath(new URL("./.data", import.meta.url)), { recursive: true, force: true });
}
