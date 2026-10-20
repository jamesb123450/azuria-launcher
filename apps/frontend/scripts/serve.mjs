import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep } from "node:path";
const root = resolve(fileURLToPath(new URL("../dist/", import.meta.url)));
// Follow the built site, including Vercel's / and GitHub Pages subdirectories.
const index = await readFile(resolve(root, "index.html"), "utf8");
const canonical = index.match(/<link\s+rel="canonical"\s+href="([^"]+)"/);
const base = canonical ? new URL(canonical[1]).pathname : "/";
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
};
createServer(async (request, response) => {
  try {
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405).end();
      return;
    }
    const pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    if (pathname === "/" && base !== "/") {
      response.writeHead(302, { Location: base }).end();
      return;
    }
    if (!pathname.startsWith(base)) {
      response.writeHead(404).end();
      return;
    }
    let path = resolve(root, pathname.slice(base.length));
    if (path !== root && !path.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    if ((await stat(path)).isDirectory()) path = resolve(path, "index.html");
    const body = await readFile(path);
    response.writeHead(200, {
      "Content-Type": mime[extname(path)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(404).end("Not found. Run npm run website:build first.");
  }
}).listen(8080, "127.0.0.1", () =>
  console.log(`Azuria website: http://127.0.0.1:8080${base}`),
);
