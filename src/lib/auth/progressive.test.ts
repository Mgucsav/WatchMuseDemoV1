import { describe, expect, it } from "vitest";

import {
  ACCOUNT_SAVE_PROMPT_MIN_ITEMS,
  shouldPromptToSaveAccount,
} from "./progressive";

describe("shouldPromptToSaveAccount", () => {
  it("kullanıcı beş film ekledikten sonra çağrıyı gösterir", () => {
    expect(shouldPromptToSaveAccount(ACCOUNT_SAVE_PROMPT_MIN_ITEMS - 1)).toBe(false);
    expect(shouldPromptToSaveAccount(ACCOUNT_SAVE_PROMPT_MIN_ITEMS)).toBe(true);
    expect(shouldPromptToSaveAccount(12)).toBe(true);
  });

  it("geçersiz sayaçları çağrı eşiği saymaz", () => {
    expect(shouldPromptToSaveAccount(-1)).toBe(false);
    expect(shouldPromptToSaveAccount(2.5)).toBe(false);
    expect(shouldPromptToSaveAccount(Number.NaN)).toBe(false);
  });
});
