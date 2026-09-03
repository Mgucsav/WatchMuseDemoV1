import type { RoomVisibility } from "./types";

/** Kalıcı hesap yalnızca public oda oluşturma ve katılımında gerekir. */
export function requiresRegisteredRoomAccount(
  visibility: RoomVisibility,
): boolean {
  return visibility === "public";
}
