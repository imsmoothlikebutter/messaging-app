import type { ClientToServerMessage, ServerToClientMessage } from "./types";

type Listener = (msg: ServerToClientMessage) => void;

export class WsClient {
  private socket: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private closedByUser = false;
  //buffer between retries
  private backoffMs = 1000;
  private url: string;
  private token: string;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }
  connect() {
    this.closedByUser = false;
    this.socket = new WebSocket(this.url);

    this.socket.onopen = () => {
      this.backoffMs = 1000;
      this.send({ type: "auth", token: this.token });
    };

    this.socket.onmessage = (event) => {
      const msg: ServerToClientMessage = JSON.parse(event.data);
      this.listeners.forEach((l) => l(msg));
    };

    this.socket.onclose = () => {
      if (this.closedByUser) return;
      setTimeout(() => this.connect(), this.backoffMs);
      //max buffer of 15s in case server is down/restarting
      this.backoffMs = Math.min(this.backoffMs * 2, 15000);
    };
  }

  //if messages were sent when while disconnected, it would be dropped here.
  //have to implement queue to push messages to server
  send(msg: ClientToServerMessage) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  onMessage(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close() {
    this.closedByUser = true;
    this.socket?.close();
  }
}
