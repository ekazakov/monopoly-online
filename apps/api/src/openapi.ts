import { format } from "vite-plus/fmt";
import pkg from "../package.json" with { type: "json" };
import type { AppType } from "./app.ts";

export function buildOpenApiDocument(app: AppType) {
  return app.getOpenAPI31Document({
    openapi: "3.1.0",
    info: { title: "Harborfront API", version: pkg.version || "0.0.0" },
  });
}

/** The text of `openapi.json`: formatted like `vp fmt` formats it, so the committed file stays stable. */
export async function renderOpenApiJson(document: ReturnType<typeof buildOpenApiDocument>) {
  const { code, errors } = await format("openapi.json", JSON.stringify(document, null, 2));
  if (errors.length > 0) throw new Error(errors.map((e) => e.message).join("\n"));
  return code;
}
