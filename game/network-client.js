export class NetworkClient {
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.socket = null;
    this.playerName = "";
    this.active = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = 0;
    this.playerId = null;
  }

  join(playerName) {
    this.playerName = playerName;
    this.active = true;
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.send({ type: "join", name: this.playerName });
      return;
    }
    this.connect();
  }

  connect() {
    if (!this.active || this.socket?.readyState === WebSocket.OPEN
      || this.socket?.readyState === WebSocket.CONNECTING) return;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    this.handlers.status?.("connecting");
    this.socket = new WebSocket(`${protocol}//${location.host}/ws`);

    this.socket.addEventListener("open", () => {
      this.reconnectAttempts = 0;
      this.handlers.status?.("connected");
      this.send({ type: "join", name: this.playerName });
    });
    this.socket.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === "connected") this.playerId = message.playerId;
      this.handlers[message.type]?.(message);
    });
    this.socket.addEventListener("close", () => {
      this.socket = null;
      this.handlers.status?.(this.active ? "reconnecting" : "disconnected");
      if (!this.active) return;
      const delay = Math.min(8000, 500 * 2 ** this.reconnectAttempts);
      this.reconnectAttempts += 1;
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    });
    this.socket.addEventListener("error", () => {
      this.handlers.status?.("error");
    });
  }

  send(message) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  sendInput(input) {
    return this.send({ type: "input", input });
  }

  leave() {
    this.active = false;
    clearTimeout(this.reconnectTimer);
    this.send({ type: "leave" });
    this.socket?.close(1000, "Left lobby");
    this.socket = null;
    this.playerId = null;
  }
}
