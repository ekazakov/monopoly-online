// Writes apps/api/openapi.json. Run: node scripts/generate-openapi.ts (from apps/api) or pnpm openapi.
// scripts/ is outside the tsconfig include, so the node types come from this reference.
/// <reference types="node" />
import { writeFile } from "node:fs/promises";
import type { Kysely } from "kysely";
import { createApp } from "../src/app.ts";
import type { Database } from "../src/db/schema.ts";
import { buildOpenApiDocument, renderOpenApiJson } from "../src/openapi.ts";

// The document comes from the route declarations only. No handler runs, so no database is opened.
const app = createApp({} as Kysely<Database>);
const json = await renderOpenApiJson(buildOpenApiDocument(app));
await writeFile(new URL("../openapi.json", import.meta.url), json);
console.log("Wrote apps/api/openapi.json");
