// js/sync-channel.js - Unified BroadcastChannel & WebSocket Sync Bus

class PresentationSyncBus {
  constructor(role = 'presenter') {
    this.role = role;
    this.broadcastChannel = null;
    this.ws = null;
    this.listeners = new Map();
    this.isConnectedToWs = false;
    this.isAudienceConnected = false;
    this.initBroadcastChannel();
    this.initWebSocket();
  }

  // 1. Browser BroadcastChannel (Instant same-browser communication)
  initBroadcastChannel() {
    try {
      this.broadcastChannel = new BroadcastChannel('pdf_presenter_sync_bus');
      this.broadcastChannel.onmessage = (event) => {
        if (event.data) {
          this.handleIncomingMessage(event.data, 'broadcast_channel');
        }
      };
    } catch (e) {
      console.warn('[SyncBus] BroadcastChannel not available, relying on WebSocket/storage', e);
    }
  }

  // 2. WebSocket Hub (For Companion API bridge and remote networks)
  initWebSocket() {
    // In Electron file:// protocol, IPC is used; only connect WS if running over HTTP/HTTPS
    if (!window.location.host || window.location.protocol === 'file:') {
      return;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnectedToWs = true;
        this.emitWs({
          type: 'CLIENT_HELLO',
          role: this.role,
          timestamp: Date.now()
        });
        this.dispatch('ws_status', { connected: true });
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleIncomingMessage(msg, 'websocket');
        } catch (err) {
          console.error('[SyncBus WS Error]', err);
        }
      };

      this.ws.onclose = () => {
        this.isConnectedToWs = false;
        this.dispatch('ws_status', { connected: false });
        // Attempt reconnection after 3 seconds
        setTimeout(() => this.initWebSocket(), 3000);
      };

      this.ws.onerror = () => {
        this.isConnectedToWs = false;
      };
    } catch (e) {
      console.warn('[SyncBus] WebSocket connection failed', e);
    }
  }

  // Dispatch message to registered listeners
  handleIncomingMessage(msg, source = 'unknown') {
    if (!msg || !msg.type) return;

    // Heartbeat & Connection Tracker
    if (msg.type === 'HEARTBEAT_PING') {
      if (this.role === 'audience') {
        this.send({ type: 'HEARTBEAT_PONG', from: 'audience' });
      }
      return;
    }
    if (msg.type === 'HEARTBEAT_PONG') {
      this.isAudienceConnected = true;
      this.dispatch('audience_status', { connected: true });
      return;
    }

    // Deliver event
    this.dispatch(msg.type, msg);
  }

  // Broadcast an event to all other windows/screens and the server
  send(messageObj) {
    messageObj.timestamp = Date.now();
    messageObj.sender = this.role;

    // Send over BroadcastChannel
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(messageObj);
      } catch (e) {
        console.warn('[SyncBus] BroadcastChannel post failed', e);
      }
    }

    // Send over WebSocket (for Companion server state sync or forwarded events)
    this.emitWs(messageObj);
  }

  emitWs(messageObj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(messageObj));
    }
  }

  // Event Subscription
  on(eventType, callback) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType).add(callback);
    return () => this.off(eventType, callback);
  }

  off(eventType, callback) {
    if (this.listeners.has(eventType)) {
      this.listeners.get(eventType).delete(callback);
    }
  }

  dispatch(eventType, data) {
    if (this.listeners.has(eventType)) {
      for (const callback of this.listeners.get(eventType)) {
        try {
          callback(data);
        } catch (e) {
          console.error(`[SyncBus Listener Error: ${eventType}]`, e);
        }
      }
    }
  }
}

// Attach globally
window.PresentationSyncBus = PresentationSyncBus;
