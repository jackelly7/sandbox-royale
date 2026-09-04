import { MULTIPLAYER_URL } from './network-config.ts';
import type {
  Command,
  ConnectionStatus,
  RoomSession,
  RoomSnapshot,
  PlayerPose,
} from './multiplayer.ts';

async function requestRoom(body: unknown, timeout: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
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
  }
}

export class MultiplayerClient {
  session: RoomSession;
  onRoom: (room: RoomSnapshot, acknowledgedPose?: PlayerPose) => void;
  onStatus: (status: ConnectionStatus) => void;
  onError: (message: string) => void;
  closed = false;
  retry = 0;
  receivedRoom = false;
  sequence = 0;
  sentPoses = new Map<number, PlayerPose>();
  timer: ReturnType<typeof setTimeout> | null = null;
  pending: { seq: number; command: Command }[] = [];
  pose: Command | null = null;
  constructor(
    session: RoomSession,
    onRoom: (room: RoomSnapshot, acknowledgedPose?: PlayerPose) => void,
    onStatus: (status: ConnectionStatus) => void,
    onError: (message: string) => void,
  ) {
    this.session = session;
    this.onRoom = onRoom;
    this.onStatus = onStatus;
    this.onError = onError;
    this.onStatus('connecting');
    void this.sync();
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
      this.pending = this.pending.filter((a) => a.command.type !== 'pose');
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
    if (this.pending.length < 24) {
      if (this.pose) {
        this.pending.push({ seq: ++this.sequence, command: this.pose });
        this.pose = null;
      }
      this.pending.push({ seq: ++this.sequence, command });
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
