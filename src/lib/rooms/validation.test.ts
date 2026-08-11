import { describe, expect, it } from "vitest";

import { isRoomUuid, isRoomVoteChoice } from "./validation";

describe("room route input validation", () => {
  it("yalnızca geçerli UUID v4/v7 biçimlerini kabul eder", () => {
    expect(isRoomUuid("f4bde699-e65a-48fc-ae7c-1ba94f06d82c")).toBe(true);
    expect(isRoomUuid("0198da7e-225f-7d83-bceb-a3321b1fa1d0")).toBe(true);
    expect(isRoomUuid("not-a-uuid")).toBe(false);
    expect(isRoomUuid("f4bde699-e65a-48fc-ae7c-1ba94f06d82c/evil")).toBe(false);
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
