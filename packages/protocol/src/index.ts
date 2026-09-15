// packages/protocol — versioned wire contract (D12/Foundation).
// RULE: no agent alters this file without updating the contract tests.
// Envelope: {v,type,room,seq,serverTime?,payload} — codec-independent.
export const PROTOCOL_V = 1;

export type MsgType =
  | 'input' | 'answer' | 'strokeBatch' | 'roomPresence'
  | 'snapshot' | 'event' | 'roundState' | 'emote' | 'reconnect';

export interface Envelope<T = unknown> {
  v: number;
  type: MsgType;
  room: string;
  seq: number;
  serverTime?: number;
  payload: T;
}

export interface InputPayload { dx: number; dy: number; dash?: boolean; fire?: boolean; aim?: number }
export interface AnswerPayload { i: number }
export interface StrokePoint { x: number; y: number }
export interface StrokeBatchPayload { strokeId: number; pts: StrokePoint[]; done: boolean }
export interface EmotePayload { i: number }
export interface ReconnectPayload { token: string }

export const ROOM_RE = /^[A-Z0-9]{4,8}$/;
const TYPES: MsgType[] = ['input', 'answer', 'strokeBatch', 'roomPresence', 'snapshot', 'event', 'roundState', 'emote', 'reconnect'];
const MAX_STROKE_PTS = 64;

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export function isEnvelope(raw: unknown): raw is Envelope {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return r.v === PROTOCOL_V
    && typeof r.type === 'string' && (TYPES as string[]).includes(r.type)
    && typeof r.room === 'string' && ROOM_RE.test(r.room)
    && Number.isInteger(r.seq) && (r.seq as number) >= 0
    && (r.serverTime === undefined || finite(r.serverTime))
    && r.payload !== undefined && typeof r.payload === 'object' && r.payload !== null;
}

export function isInput(p: unknown): p is InputPayload {
  if (typeof p !== 'object' || p === null) return false;
  const v = p as Record<string, unknown>;
  if (!finite(v.dx) || !finite(v.dy)) return false;
  if (v.dash !== undefined && typeof v.dash !== 'boolean') return false;
  if (v.fire !== undefined && typeof v.fire !== 'boolean') return false;
  if (v.aim !== undefined && !finite(v.aim)) return false;
  return true;
}

export function isAnswer(p: unknown): p is AnswerPayload {
  if (typeof p !== 'object' || p === null) return false;
  const v = (p as Record<string, unknown>).i;
  return Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 3;
}

export function isStrokeBatch(p: unknown): p is StrokeBatchPayload {
  if (typeof p !== 'object' || p === null) return false;
  const v = p as Record<string, unknown>;
  if (!Number.isInteger(v.strokeId) || (v.strokeId as number) < 0) return false;
  if (typeof v.done !== 'boolean') return false;
  if (!Array.isArray(v.pts) || v.pts.length === 0 || v.pts.length > MAX_STROKE_PTS) return false;
  return (v.pts as unknown[]).every(pt =>
    typeof pt === 'object' && pt !== null
    && Number.isInteger((pt as Record<string, unknown>).x)
    && Number.isInteger((pt as Record<string, unknown>).y));
}

export function isEmote(p: unknown): p is EmotePayload {
  if (typeof p !== 'object' || p === null) return false;
  const v = (p as Record<string, unknown>).i;
  return Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 4;
}

export function isReconnect(p: unknown): p is ReconnectPayload {
  if (typeof p !== 'object' || p === null) return false;
  const v = (p as Record<string, unknown>).token;
  return typeof v === 'string' && v.length >= 8 && v.length <= 128;
}

export function makeEnvelope<T>(type: MsgType, room: string, seq: number, payload: T): Envelope<T> {
  return { v: PROTOCOL_V, type, room, seq, payload };
}
