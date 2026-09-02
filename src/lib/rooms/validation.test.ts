import { describe, expect, it } from "vitest";

import {
  isRoomUuid,
  isRoomVisibility,
  isRoomVoteChoice,
  normalizeRoomCapacity,
  normalizeRoomMessage,
  normalizeRoomName,
  normalizeRoomPassword,
} from "./validation";

describe("room route input validation", () => {
  it("yalnızca geçerli UUID v4/v7 biçimlerini kabul eder", () => {
    expect(isRoomUuid("f4bde699-e65a-48fc-ae7c-1ba94f06d82c")).toBe(true);
    expect(isRoomUuid("0198da7e-225f-7d83-bceb-a3321b1fa1d0")).toBe(true);
    expect(isRoomUuid("not-a-uuid")).toBe(false);
    expect(isRoomUuid("f4bde699-e65a-48fc-ae7c-1ba94f06d82c/evil")).toBe(false);
  });

  it("oda mesajını kırpar ve uzun/boş girdiyi reddeder", () => {
    expect(normalizeRoomMessage("  Merhaba oda  ")).toBe("Merhaba oda");
    expect(normalizeRoomMessage("   ")).toBeNull();
    expect(normalizeRoomMessage("x".repeat(1001))).toBeNull();
    expect(normalizeRoomMessage(null)).toBeNull();
  });

  it("oda görünürlüğü, kapasitesi ve adını sınırlar", () => {
    expect(isRoomVisibility("private")).toBe(true);
    expect(isRoomVisibility("public")).toBe(true);
    expect(isRoomVisibility("unlisted")).toBe(false);
    expect(normalizeRoomCapacity(2)).toBe(2);
    expect(normalizeRoomCapacity(20)).toBe(20);
    expect(normalizeRoomCapacity(1)).toBeNull();
    expect(normalizeRoomCapacity(21)).toBeNull();
    expect(normalizeRoomName("  Cuma   gecesi ")).toBe("Cuma gecesi");
    expect(normalizeRoomName(" ")).toBeNull();
  });

  it("private oda şifresini 6-64 karakter ve kontrol karaktersiz sınırlar", () => {
    expect(normalizeRoomPassword("123456")).toBe("123456");
    expect(normalizeRoomPassword("boşluk kabul edilir")).toBe("boşluk kabul edilir");
    expect(normalizeRoomPassword("12345")).toBeNull();
    expect(normalizeRoomPassword("x".repeat(65))).toBeNull();
    expect(normalizeRoomPassword("abc\n123")).toBeNull();
  });

  it("oy API'sinde yalnızca üç izinli tercihi kabul eder", () => {
    expect(isRoomVoteChoice("skip")).toBe(true);
    expect(isRoomVoteChoice("maybe")).toBe(true);
    expect(isRoomVoteChoice("want")).toBe(true);
    expect(isRoomVoteChoice("want; drop table room_votes")).toBe(false);
    expect(isRoomVoteChoice("yes")).toBe(false);
    expect(isRoomVoteChoice(null)).toBe(false);
  });
});
