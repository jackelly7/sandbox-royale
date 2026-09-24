import { MULTIPLAYER_URL, REALTIME_URL } from './network-config.ts';
import type {
  Command,
  ConnectionStatus,
  RoomSession,
  RoomSnapshot,
  PlayerPose,
  ActiveRoom,
} from './multiplayer.ts';

async function requestRoom(
  body: unknown,
  timeout: number,
  signal?: AbortSignal,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const response = await fetch(MULTIPLAYER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.headers.get('content-type')?.includes('application/json'))
      throw new Error(
        'The room service did not respond. Please try joining again.',
      );
    const data = await response.json();
    return { response, data };
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error(
        'Connection timed out. Check your internet connection and try again.',
      );
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

export class MultiplayerClient {
  static async list(signal?: AbortSignal): Promise<ActiveRoom[]> {
    const { response, data: raw } = await requestRoom(
      { type: 'list' },
      8000,
      signal,
    );
    const data = raw as { rooms?: ActiveRoom[]; error?: string };
    if (!response.ok || !Array.isArray(data?.rooms))
      throw new Error(data?.error || 'Could not load active games. Try again.');
    return data.rooms;
  }
  session: RoomSession;
  onRoom: (room: RoomSnapshot, acknowledgedPose?: PlayerPose) => void;
  onStatus: (status: ConnectionStatus) => void;
  onError: (message: string) => void;
  closed = false;
  retry = 0;
  receivedRoom = false;
  sequence = 0;
  lastSentSequence = 0;
  sentPoses = new Map<number, PlayerPose>();
  timer: ReturnType<typeof setTimeout> | null = null;
  pending: { seq: number; command: Command }[] = [];
  pose: Command | null = null;
  socket: WebSocket | null = null;
  beat: ReturnType<typeof setInterval> | null = null;
  lastServer = 0;
  lastPing = 0;
  socketReady = false;
  transport: 'websocket' | 'http';
  constructor(
    session: RoomSession,
    onRoom: (room: RoomSnapshot, acknowledgedPose?: PlayerPose) => void,
    onStatus: (status: ConnectionStatus) => void,
    onError: (message: string) => void,
    transport: 'websocket' | 'http' = 'websocket',
  ) {
    this.session = session;
    this.onRoom = onRoom;
    this.onStatus = onStatus;
    this.onError = onError;
    this.transport = transport;
    this.onStatus('connecting');
    if (transport === 'websocket') this.connect();
    else void this.sync();
  }
  connect() {
    if (this.closed) return;
    this.socketReady = false;
    this.lastSentSequence = 0;
    this.lastServer = Date.now();
    const socket = (this.socket = new WebSocket(REALTIME_URL));
    socket.onopen = () =>
      socket.send(JSON.stringify({ type: 'auth', ...this.session }));
    socket.onmessage = (event) => {
      if (this.closed || this.socket !== socket) return;
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'ready') {
          this.socketReady = true;
          this.flush();
        }
        if (message.type === 'error') {
          this.onError(message.message);
          if (message.retryable === false) {
            this.close(false);
            return;
          }
        }
        if (message.type === 'snapshot') {
          this.lastServer = Date.now();
          this.retry = 0;
          this.receivedRoom = true;
          const acknowledged = [...this.sentPoses.entries()]
            .filter(([seq]) => seq <= message.ack)
            .sort((a, b) => b[0] - a[0]);
          for (const [seq] of acknowledged) this.sentPoses.delete(seq);
          this.pending = this.pending.filter((a) => a.seq > message.ack);
          this.onStatus('connected');
          this.onRoom(message.room, acknowledged[0]?.[1]);
        }
      } catch {
        this.onError('Could not read the match update.');
      }
    };
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      if (this.socket !== socket) return;
      if (this.beat) clearInterval(this.beat);
      this.beat = null;
      this.socketReady = false;
      if (this.closed) return;
      this.retry++;
      if (!this.receivedRoom && this.retry >= 3) {
        this.onError(
          'The live connection could not open. Leave the room and try again.',
        );
        this.close();
        return;
      }
      this.onStatus('reconnecting');
      this.timer = setTimeout(
        () => this.connect(),
        Math.min(250 * 2 ** this.retry, 3000),
      );
    };
    this.beat = setInterval(() => {
      // Pongs prove the socket is alive, not that the match is advancing.
      if (Date.now() - this.lastServer > 8000) {
        socket.close();
        return;
      }
      this.flush();
      if (this.socketReady && Date.now() - this.lastPing > 1000) {
        this.lastPing = Date.now();
        socket.send(JSON.stringify({ type: 'ping', at: this.lastPing }));
      }
    }, 50);
  }
  flush() {
    if (
      !this.socketReady ||
      this.socket?.readyState !== 1 ||
      this.socket.bufferedAmount > 64000
    )
      return;
    if (this.pose) {
      // Coalesce only the trailing pose. A pose before an action must retain
      // its place so a queued pickup/shot uses the position at that moment.
      if (this.pending.at(-1)?.command.type === 'pose') this.pending.pop();
      this.pending.push({ seq: ++this.sequence, command: this.pose });
      this.pose = null;
    }
    if (!this.pending.length) return;
    // WebSocket delivers in order. Retry unacknowledged actions only after
    // reconnecting, rather than multiplying traffic when the server is busy.
    const actions = this.pending
      .filter((action) => action.seq > this.lastSentSequence)
      .slice(0, 24);
    if (!actions.length) return;
    for (const action of actions)
      if (action.command.type === 'pose' || action.command.type === 'shoot')
        this.sentPoses.set(action.seq, action.command.pose);
    while (this.sentPoses.size > 256)
      this.sentPoses.delete(this.sentPoses.keys().next().value!);
    this.socket.send(JSON.stringify({ type: 'commands', actions }));
    this.lastSentSequence = actions.at(-1)!.seq;
  }
  static async enter(name: string, code?: string) {
    const { response, data: value } = await requestRoom(
      {
        type: code ? 'join' : 'create',
        name,
        code: code?.trim().toUpperCase(),
      },
      12000,
    );
    const data = value as Partial<RoomSession> & { error?: string };
    if (!data || typeof data !== 'object')
      throw new Error('Could not join the room. Please try again.');
    if (!response.ok) throw new Error(data.error || 'Could not join the room.');
    if (!data.code || !data.playerId || !data.token)
      throw new Error('Could not join the room. Please try again.');
    return data as RoomSession;
  }
  async sync() {
    if (this.closed) return;
    this.timer = null;
    const started = Date.now();
    if (this.pose) {
      // Coalesce only the trailing pose. A pose before an action must retain
      // its place so a queued pickup/shot uses the position at that moment.
      if (this.pending.at(-1)?.command.type === 'pose') this.pending.pop();
      this.pending.push({ seq: ++this.sequence, command: this.pose });
      this.pose = null;
    }
    const actions = this.pending.slice(0, 16);
    for (const action of actions)
      if (action.command.type === 'pose' || action.command.type === 'shoot')
        this.sentPoses.set(action.seq, action.command.pose);
    if (this.sentPoses.size > 256)
      this.sentPoses.delete(this.sentPoses.keys().next().value!);
    try {
      const { response, data } = await requestRoom(
        { type: 'sync', ...this.session, actions },
        8000,
      );
      const result = data as {
        room: RoomSnapshot;
        ack: number;
        error?: string;
      };
      if (this.closed) return;
      if (!response.ok) {
        if (response.status === 401 || response.status === 404) {
          this.closed = true;
          this.onStatus('offline');
          this.onError(result.error || 'Your room session has ended.');
          return;
        }
        throw new Error(result.error || 'Connection interrupted.');
      }
      const acknowledged = [...this.sentPoses.entries()]
        .filter(([seq]) => seq <= result.ack)
        .sort((a, b) => b[0] - a[0]);
      const acknowledgedPose = acknowledged[0]?.[1];
      for (const [seq] of acknowledged) this.sentPoses.delete(seq);
      this.pending = this.pending.filter((a) => a.seq > result.ack);
      this.retry = 0;
      this.receivedRoom = true;
      this.onStatus('connected');
      if (result.error) this.onError(result.error);
      this.onRoom(result.room, acknowledgedPose);
    } catch (e) {
      if (this.closed) return;
      this.retry++;
      if (!this.receivedRoom && this.retry >= 3) {
        this.onError(
          'Could not load this room. Leave the room and try joining again.',
        );
        this.close();
        return;
      }
      this.onStatus('reconnecting');
      if (this.retry === 3)
        this.onError(
          e instanceof Error
            ? e.message
            : 'Connection interrupted. Reconnecting...',
        );
    }
    if (!this.closed)
      this.timer = setTimeout(
        () => {
          void this.sync();
        },
        this.retry
          ? Math.min(300 * 2 ** this.retry, 4000)
          : Math.max(0, 100 - (Date.now() - started)) + Math.random() * 15,
      );
  }
  send(command: Command) {
    if (this.closed) return;
    if (command.type === 'pose') {
      this.pose = command;
      return;
    }
    if (command.type === 'ping') return;
    if (this.pending.filter((a) => a.command.type !== 'pose').length < 24) {
      if (this.pose) {
        this.pending.push({ seq: ++this.sequence, command: this.pose });
        this.pose = null;
      }
      this.pending.push({ seq: ++this.sequence, command });
      if (this.transport === 'websocket') {
        this.flush();
        return;
      }
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
        void this.sync();
      }
    }
  }
  close(leave = true) {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.beat) clearInterval(this.beat);
    if (this.socket?.readyState === 1 && this.socketReady) {
      if (leave)
        this.socket.send(
          JSON.stringify({
            type: 'commands',
            actions: [{ seq: ++this.sequence, command: { type: 'leave' } }],
          }),
        );
      // Allow the server to apply leave and close the socket itself.
      const socket = this.socket;
      setTimeout(() => socket.close(), 500);
      this.onStatus('offline');
      return;
    }
    this.socket?.close();
    if (leave)
      void fetch(MULTIPLAYER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'sync',
          ...this.session,
          actions: [{ seq: ++this.sequence, command: { type: 'leave' } }],
        }),
        keepalive: true,
      }).catch(() => {});
    this.onStatus('offline');
  }
}
