const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const preferredPort = Number(process.env.PORT || 4173);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };

const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.resolve(root, `.${requestedPath}`);
  if (!filePath.startsWith(root + path.sep)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, contents) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream", "Cache-Control": "no-store" });
    response.end(contents);
  });
});

function listen(port) {
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE") return listen(port + 1);
    throw error;
  });
  server.listen(port, "127.0.0.1", () => console.log(`我的宿舍小仓库已启动：http://localhost:${port}`));
}

listen(preferredPort);
