import type { RoomVoteChoice } from "./types";

export const ROOM_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isRoomUuid(value: string): boolean {
  return ROOM_UUID_PATTERN.test(value);
}

export function isRoomVoteChoice(value: unknown): value is RoomVoteChoice {
  return value === "skip" || value === "maybe" || value === "want";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
