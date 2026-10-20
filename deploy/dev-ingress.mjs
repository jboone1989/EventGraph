// Development ingress is intentionally small and runs as a Docker service.
// No host Nginx install, privileged shell or build is required.
// Bind names are overridable so tests can run the script against local fakes.
import http from "node:http";
import { pipeline } from "node:stream";

const port = Number(process.env.DEV_INGRESS_PORT ?? 8080);
const upstream = {
  hostname: process.env.DEV_INGRESS_UPSTREAM_HOST ?? "web",
  port: Number(process.env.DEV_INGRESS_UPSTREAM_PORT ?? 3000),
};
const server = http.createServer((req, res) => {
  const forwarded = {
    ...req.headers,
    "x-forwarded-proto": "http",
    "x-forwarded-host": req.headers.host || "",
  };
  const target = http.request({
    ...upstream, method: req.method, path: req.url, headers: forwarded,
  }, reply => {
    // A departing client must never kill the process: pipeline() throws synchronously
    // when the client side is already destroyed, so check and drop before piping.
    if (res.destroyed) { reply.destroy(); return; }
    res.writeHead(reply.statusCode ?? 502, reply.headers);
    pipeline(reply, res, error => {
      if (error) { reply.destroy(); res.destroy(); }
    });
  });
  target.setTimeout(60000, () => target.destroy(new Error("upstream timeout")));
  target.on("error", error => {
    console.error("dev_ingress_upstream_error", error.message);
    if (!res.headersSent && !res.destroyed) res.writeHead(502, { "content-type": "text/plain" });
    if (!res.destroyed) res.end("Development web upstream unavailable");
  });
  pipeline(req, target, error => {
    if (error && !target.destroyed) target.destroy();
  });
});
server.on("upgrade", (request, socket) => {
  socket.end("HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\n\r\n");
});
server.listen(port, "0.0.0.0", () => {
  console.log("development ingress ready on port " + port);
});
