import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vite-plus/test";
// The app (and with it `@hono/zod-openapi`) loads before `@monopoly/shared`, as the zod extension needs.
import { createApp } from "./app.ts";
import { apiErrorSchema } from "@monopoly/shared";
import type { Kysely } from "kysely";
import { createDb } from "./db/client.ts";
import { migrateToLatest } from "./db/migrations.ts";
import type { Database } from "./db/schema.ts";
import { serveWeb } from "./web.ts";

const INDEX = '<!doctype html><html><body><div id="root"></div></body></html>';

describe("serveWeb", () => {
  let parent: string;
  let dist: string;
  let db: Kysely<Database>;
  let web: ReturnType<typeof serveWeb>;

  beforeAll(() => {
    parent = mkdtempSync(join(tmpdir(), "web-"));
    dist = join(parent, "dist");
    mkdirSync(join(dist, "assets"), { recursive: true });
    writeFileSync(join(dist, "index.html"), INDEX);
    writeFileSync(join(dist, "assets", "index-abc123.js"), "export const x = 1;");
    writeFileSync(join(dist, "favicon.svg"), "<svg/>");
    // Next to the build and not in it: no request may reach it.
    writeFileSync(join(parent, "secret.txt"), "top secret");
  });

  afterAll(() => {
    rmSync(parent, { recursive: true, force: true });
  });

  beforeEach(async () => {
    db = createDb(":memory:");
    await migrateToLatest(db);
    web = serveWeb(createApp(db, { auth: { guest: true } }), { distDir: dist });
  });

  afterEach(async () => {
    await db.destroy();
  });

  test("the root and a route of the web app get index.html, revalidated", async () => {
    for (const path of ["/", "/lobby", "/games/0d3b8f7e-9a0e-4c52-8a65-1d0f1f9a6f11"]) {
      const res = await web.request(path);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/text\/html/);
      expect(res.headers.get("cache-control")).toBe("no-cache");
      expect(await res.text()).toBe(INDEX);
    }
  });

  test("a build file is served with its type, and assets are cached for ever", async () => {
    const asset = await web.request("/assets/index-abc123.js");
    expect(asset.status).toBe(200);
    expect(asset.headers.get("content-type")).toMatch(/javascript/);
    expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(await asset.text()).toBe("export const x = 1;");

    const icon = await web.request("/favicon.svg");
    expect(icon.status).toBe(200);
    expect(icon.headers.get("content-type")).toMatch(/svg/);
    expect(icon.headers.get("cache-control")).toBe("no-cache");
  });

  test("a missing file is a 404, not the page of HTML", async () => {
    const res = await web.request("/assets/old-def456.js");
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("<div");
  });

  test("an unknown /api path gets the JSON error, not index.html", async () => {
    for (const path of ["/api/unknown", "/api/nope/x/y/z", "/api"]) {
      const res = await web.request(path);
      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toMatch(/application\/json/);
      expect(apiErrorSchema.parse(await res.json()).error.code).toBe("not_found");
    }
  });

  test("an unknown /api path still has a request id", async () => {
    const res = await web.request("/api/unknown");
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
  });

  test("the API routes work as before", async () => {
    const health = await web.request("/api/health");
    expect(await health.json()).toEqual({ status: "ok" });
    const created = await web.request("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ada" }),
    });
    expect(created.status).toBe(201);
    // And the error handler of the API still answers its own errors.
    const invalid = await web.request("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(invalid.status).toBe(400);
    expect(apiErrorSchema.parse(await invalid.json()).error.code).toBe("validation_error");
  });

  test.each([
    "/../secret.txt",
    "/%2e%2e/secret.txt",
    "/assets/../../secret.txt",
    "/..%2fsecret.txt",
  ])("%s does not reach a file outside the build", async (path) => {
    const res = await web.request(path);
    expect(await res.text()).not.toContain("top secret");
  });

  test("only GET and HEAD serve web files", async () => {
    expect((await web.request("/lobby", { method: "POST" })).status).toBe(404);
    const head = await web.request("/assets/index-abc123.js", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
  });

  test("a build with no index.html stops the start", () => {
    const empty = mkdtempSync(join(tmpdir(), "web-empty-"));
    try {
      expect(() => serveWeb(createApp(db), { distDir: empty })).toThrow(/index\.html/);
      expect(() => serveWeb(createApp(db), { distDir: join(empty, "nope") })).toThrow(
        /index\.html/,
      );
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
