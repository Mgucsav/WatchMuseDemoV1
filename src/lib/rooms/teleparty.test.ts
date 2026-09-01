import { describe, expect, it } from "vitest";

import { parseTelepartyJoinUrl } from "./teleparty";

describe("parseTelepartyJoinUrl", () => {
  it("resmi Teleparty katılım bağlantısını kabul eder", () => {
    expect(
      parseTelepartyJoinUrl(
        "  https://redirect.teleparty.com/join/390d2c023aec4fcf  ",
      ),
    ).toBe("https://redirect.teleparty.com/join/390d2c023aec4fcf");
  });

  it.each([
    "http://redirect.teleparty.com/join/390d2c023aec4fcf",
    "https://redirect.teleparty.com.evil.example/join/390d2c023aec4fcf",
    "https://redirect.teleparty.com/join/short",
    "https://redirect.teleparty.com/join/390d2c023aec4fcf?next=evil",
    "https://redirect.teleparty.com/join/390d2c023aec4fcf#fragment",
    "https://user@redirect.teleparty.com/join/390d2c023aec4fcf",
    "not-a-url",
  ])("resmi katılım bağlantısı olmayan değeri reddeder: %s", (value) => {
    expect(parseTelepartyJoinUrl(value)).toBeNull();
  });
});
