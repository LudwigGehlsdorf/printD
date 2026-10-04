// Production server: serves printD over HTTPS directly, without a reverse proxy.
// `next start` only speaks plain HTTP, so this starts Next.js behind Node's own HTTPS server.
//
//   TLS_CERT=cert.pem TLS_KEY=key.pem PORT=8080 node deploy/server.mjs
import fs from "node:fs";
import { createServer } from "node:https";
import path from "node:path";
import next from "next";

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? "0.0.0.0";
const tls = {
  cert: fs.readFileSync(process.env.TLS_CERT ?? "/etc/printd/tls/cert.pem"),
  key: fs.readFileSync(process.env.TLS_KEY ?? "/etc/printd/tls/key.pem"),
};

const app = next({ dir: path.join(import.meta.dirname, ".."), port });
const handle = app.getRequestHandler();
await app.prepare();

createServer(tls, (req, res) => handle(req, res)).listen(port, host, () => {
  console.log(`printD listening on https://${host}:${port}`);
});
