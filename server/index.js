import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import {
  extname,
  isAbsolute,
  join,
  normalize,
  relative,
} from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import { AuthoritativeMatch } from "./simulation.js";

const ROOT = normalize(join(fileURLToPath(new URL(".", import.meta.url)), ".."));
const PORT = Number(process.env.PORT) || 8000;
const ASSET_BASE_URL = String(process.env.ASSET_BASE_URL ?? "").replace(/\/+$/, "");
const ASSET_VERSION = String(process.env.ASSET_VERSION ?? "").trim();
const ALLOWED_ORIGINS = new Set(
  String(process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const MATCH_FILL_DELAY = 2500;
const MAX_MESSAGE_BYTES = 16 * 1024;
const clients = new Map();
const queue = [];
const matches = new Map();
const matchByPlayer = new Map();
let matchTimer = null;
let shuttingDown = false;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".png": "image/png",
  ".mp3": "audio/mpeg",
  ".ico": "image/x-icon",
};

const httpServer = createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
  if (!["GET", "HEAD"].includes(request.method ?? "GET")) {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  if (requestUrl.pathname === "/health") {
    const status = shuttingDown ? 503 : 200;
    const body = JSON.stringify({
      status: shuttingDown ? "shutting-down" : "ok",
      uptimeSeconds: Math.round(process.uptime()),
      clients: clients.size,
      queuedPlayers: queue.length,
      activeMatches: matches.size,
    });
    response.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(request.method === "HEAD" ? undefined : body);
    return;
  }
  if (requestUrl.pathname === "/runtime-config.js") {
    const body = `window.__PANZER_CONFIG__=${JSON.stringify({
      assetBaseUrl: ASSET_BASE_URL,
      assetVersion: ASSET_VERSION,
    })};`;
    response.writeHead(200, {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : body);
    return;
  }
  let relativePath;
  try {
    relativePath = decodeURIComponent(requestUrl.pathname);
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }
  if (relativePath === "/") relativePath = "/index.html";
  const publicPath = relativePath === "/index.html"
    || relativePath.startsWith("/game/")
    || relativePath.startsWith("/assets/");
  if (!publicPath) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    return;
  }
  const filePath = normalize(join(ROOT, relativePath));
  const pathFromRoot = relative(ROOT, filePath);
  if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)
    || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    return;
  }
  response.writeHead(200, {
    "Content-Type": MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream",
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  if (request.method === "HEAD") response.end();
  else createReadStream(filePath).pipe(response);
});

const wss = new WebSocketServer({
  server: httpServer,
  path: "/ws",
  maxPayload: MAX_MESSAGE_BYTES,
  perMessageDeflate: false,
  verifyClient(info, done) {
    if (!ALLOWED_ORIGINS.size || ALLOWED_ORIGINS.has(info.origin)) {
      done(true);
      return;
    }
    done(false, 403, "Origin not allowed");
  },
});

function safeSend(socket, message) {
  if (socket?.readyState !== WebSocket.OPEN) return;
  socket.send(typeof message === "string" ? message : JSON.stringify(message));
}

function publicQueue() {
  return queue.map((client) => ({
    id: client.id,
    name: client.name,
    isLocal: false,
  }));
}

function broadcastLobby() {
  const players = publicQueue();
  for (const client of queue) {
    safeSend(client.socket, {
      type: "lobby",
      playerId: client.id,
      players,
      startsWithBot: players.length === 3,
    });
  }
}

function removeFromQueue(client) {
  const index = queue.indexOf(client);
  if (index >= 0) queue.splice(index, 1);
  if (queue.length < 3 && matchTimer) {
    clearTimeout(matchTimer);
    matchTimer = null;
  }
}

function joinQueue(client, rawName) {
  if (matchByPlayer.has(client.id)) return;
  removeFromQueue(client);
  client.name = String(rawName ?? "PILOT")
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .trim()
    .slice(0, 16) || "PILOT";
  client.joined = true;
  queue.push(client);
  broadcastLobby();
  pumpMatchmaking();
}

function pumpMatchmaking() {
  if (queue.length >= 4) {
    if (matchTimer) clearTimeout(matchTimer);
    matchTimer = null;
    startMatch(queue.splice(0, 4));
    broadcastLobby();
    pumpMatchmaking();
    return;
  }
  if (queue.length === 3 && !matchTimer) {
    matchTimer = setTimeout(() => {
      matchTimer = null;
      if (queue.length >= 3) {
        startMatch(queue.splice(0, Math.min(4, queue.length)));
        broadcastLobby();
        pumpMatchmaking();
      }
    }, MATCH_FILL_DELAY);
  }
}

function startMatch(humans) {
  const matchId = randomUUID();
  const roster = humans.map((client) => ({
    id: client.id,
    name: client.name,
    isBot: false,
  }));
  if (roster.length === 3) {
    roster.push({
      id: `bot-${randomUUID()}`,
      name: "CORE AI",
      isBot: true,
    });
  }

  const match = new AuthoritativeMatch(matchId, roster, {
    onSnapshot(snapshot) {
      for (const human of humans) safeSend(human.socket, snapshot);
    },
    onEnd() {
      for (const human of humans) matchByPlayer.delete(human.id);
      setTimeout(() => {
        matches.delete(matchId);
      }, 15000);
    },
  });
  matches.set(matchId, match);
  for (const human of humans) matchByPlayer.set(human.id, match);

  for (const human of humans) {
    const player = match.players.find((candidate) => candidate.id === human.id);
    safeSend(human.socket, {
      type: "matchStart",
      matchId,
      playerId: human.id,
      team: player.team,
      roster: match.players.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        team: candidate.team,
        slot: candidate.slot,
        profileId: candidate.profileId,
        isBot: candidate.isBot,
      })),
    });
  }
  match.start();
  console.log(`[match] ${matchId} started with ${humans.length} human player(s)`);
}

wss.on("connection", (socket, request) => {
  const client = {
    id: randomUUID(),
    socket,
    name: "PILOT",
    joined: false,
    alive: true,
    lastMessageAt: 0,
  };
  clients.set(client.id, client);
  safeSend(socket, { type: "connected", playerId: client.id });

  socket.on("pong", () => { client.alive = true; });
  socket.on("message", (data, isBinary) => {
    if (isBinary || data.length > MAX_MESSAGE_BYTES) return socket.close(1009, "Message too large");
    const now = Date.now();
    if (now - client.lastMessageAt < 8) return;
    client.lastMessageAt = now;
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (message.type === "join") {
      joinQueue(client, message.name);
      return;
    }
    if (message.type === "leave") {
      removeFromQueue(client);
      client.joined = false;
      broadcastLobby();
      return;
    }
    if (message.type === "input") {
      matchByPlayer.get(client.id)?.setInput(client.id, message.input);
      return;
    }
    if (message.type === "requeue" && !matchByPlayer.has(client.id)) {
      joinQueue(client, client.name);
    }
  });

  socket.on("close", () => {
    clients.delete(client.id);
    removeFromQueue(client);
    broadcastLobby();
    matchByPlayer.get(client.id)?.replaceWithBot(client.id);
    matchByPlayer.delete(client.id);
  });

  const forwarded = request.headers["x-forwarded-for"];
  console.log(`[network] connected ${client.id} from ${forwarded ?? request.socket.remoteAddress}`);
});

const heartbeat = setInterval(() => {
  for (const client of clients.values()) {
    if (!client.alive) {
      client.socket.terminate();
      continue;
    }
    client.alive = false;
    client.socket.ping();
  }
}, 15000);

wss.on("close", () => clearInterval(heartbeat));
wss.on("error", (error) => {
  if (error.code !== "EADDRINUSE") console.error("[websocket]", error);
});
httpServer.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`\nPort ${PORT} wird bereits verwendet.`);
    console.error(`Panzer Duell läuft möglicherweise schon unter http://localhost:${PORT}`);
    console.error("Beende die vorhandene Serverinstanz oder setze einen anderen PORT.\n");
    process.exitCode = 1;
    clearInterval(heartbeat);
    setTimeout(() => process.exit(1), 20);
    return;
  }
  throw error;
});
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Panzer Duell server listening on http://0.0.0.0:${PORT}`);
});

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received; closing matches and connections`);
  clearTimeout(matchTimer);
  clearInterval(heartbeat);
  for (const match of matches.values()) match.stop();
  for (const client of clients.values()) {
    safeSend(client.socket, { type: "serverShutdown" });
    client.socket.close(1012, "Server restart");
  }
  wss.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => {
    for (const client of clients.values()) client.socket.terminate();
    process.exit(0);
  }, 8000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
