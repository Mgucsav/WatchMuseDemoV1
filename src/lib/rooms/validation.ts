import type { RoomVisibility, RoomVoteChoice } from "./types";

export const MIN_ROOM_CAPACITY = 2;
export const MAX_ROOM_CAPACITY = 20;
export const MAX_ROOM_NAME_LENGTH = 80;
export const MAX_ROOM_MESSAGE_LENGTH = 1000;

export const ROOM_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isRoomUuid(value: string): boolean {
  return ROOM_UUID_PATTERN.test(value);
}

export function isRoomVoteChoice(value: unknown): value is RoomVoteChoice {
  return value === "skip" || value === "maybe" || value === "want";
}

export function isRoomVisibility(value: unknown): value is RoomVisibility {
  return value === "private" || value === "public";
}

export function normalizeRoomCapacity(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_ROOM_CAPACITY &&
    value <= MAX_ROOM_CAPACITY
    ? value
    : null;
}

export function normalizeRoomName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length >= 1 && normalized.length <= MAX_ROOM_NAME_LENGTH
    ? normalized
    : null;
}

export function normalizeRoomMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length >= 1 && normalized.length <= MAX_ROOM_MESSAGE_LENGTH
    ? normalized
    : null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
