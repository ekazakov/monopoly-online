import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { notFoundHandler } from "./errors.ts";

/** Hashed build files never change under the same name, so a browser may keep them for ever. */
const IMMUTABLE = "public, max-age=31536000, immutable";

/** A last segment with a dot is a file (`/assets/app.js`), not a route of the web app. */
const looksLikeFile = (path: string) => /\.[A-Za-z0-9]+$/.test(path.split("/").pop() ?? "");

/**
 * Puts the web build (`apps/web/dist`) in front of the API on one origin and one process.
 * It wraps the API app and does not change it, so `AppType` and the API tests stay as they are.
 * - `/api/*` goes to the API. An unknown `/api/*` path gets the JSON `not_found` error, never the
 *   web page, and it still passes the API middleware (request id, log, span).
 * - A file of the build is served as it is. `/assets/*` has a long cache life and the rest
 *   (`index.html`) is revalidated, so a new build shows at the next load.
 * - Another GET path without a file extension is a route of the web app (`/games/<id>`): it gets
 *   `index.html`. A missing file (`/assets/old.js`) is a plain 404 and not a page of HTML.
 * Web requests are not logged, traced or counted: they would drown the lines of the API.
 * Throws when `distDir` has no `index.html`, so a wrong path stops the start.
 */
export function serveWeb(api: Hono<any, any, any>, options: { distDir: string }): Hono {
  const root = resolve(options.distDir);
  if (!existsSync(join(root, "index.html"))) {
    throw new Error(`WEB_DIST_DIR has no index.html: ${root}`);
  }

  const web = new Hono();
  web.route("/", api);
  // After the API routes: only a path that no API route took gets here.
  web.all("/api", notFoundHandler);
  web.all("/api/*", notFoundHandler);

  web.on(["GET", "HEAD"], "*", async (c, next) => {
    await next();
    if (c.res.status !== 200 || c.res.headers.has("cache-control")) return;
    c.header("Cache-Control", c.req.path.startsWith("/assets/") ? IMMUTABLE : "no-cache");
  });
  web.on(["GET", "HEAD"], "*", serveStatic({ root }));
  web.on(
    ["GET", "HEAD"],
    "*",
    (c, next) => (looksLikeFile(c.req.path) ? c.text("Not found", 404) : next()),
    serveStatic({ root, path: "index.html" }),
  );
  return web;
}
