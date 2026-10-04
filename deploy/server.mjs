// Production server: serves printD over HTTPS directly, without a reverse proxy.
// `next start` only speaks plain HTTP, so this starts Next.js behind Node's own HTTPS server.
//
//   TLS_CERT=cert.pem TLS_KEY=key.pem PORT=8443 node deploy/server.mjs
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import next from "next";

const port = Number(process.env.PORT || 8443);
const host = process.env.HOST || "0.0.0.0";
const tls = {
  cert: fs.readFileSync(process.env.TLS_CERT || "/etc/printd/tls/cert.pem"),
  key: fs.readFileSync(process.env.TLS_KEY || "/etc/printd/tls/key.pem"),
};

const app = next({ dir: path.join(import.meta.dirname, ".."), port });
const handle = app.getRequestHandler();
await app.prepare();

const secure = https.createServer(tls, (req, res) => handle(req, res));

// Someone typing http:// on this port gets redirected instead of an empty reply.
const redirect = http.createServer((req, res) => {
  const origin = process.env.AUTH_URL || `https://${req.headers.host}`;
  res.writeHead(301, { Location: new URL(req.url, origin).href }).end();
});

// Both share the port: a TLS connection starts with a handshake record (byte 0x16), plain
// HTTP with a method name.
net
  .createServer((socket) => {
    socket.once("data", (chunk) => {
      socket.pause();
      socket.unshift(chunk);
      (chunk[0] === 0x16 ? secure : redirect).emit("connection", socket);
      process.nextTick(() => socket.resume());
    });
    socket.on("error", () => socket.destroy());
  })
  .listen(port, host, () => {
    console.log(`printD listening on https://${host}:${port}`);
  });
