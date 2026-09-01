import { describe, expect, it } from "vitest";

import {
  parseTelepartyJoinUrl,
  telepartyProviderLaunches,
} from "./teleparty";

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

describe("telepartyProviderLaunches", () => {
  it("yalnız mevcut Teleparty-destekli sağlayıcıların aramasını üretir", () => {
    expect(
      telepartyProviderLaunches("Operasyon: Argo", [
        "netflix",
        "prime_video",
        "mubi",
      ]),
    ).toEqual([
      {
        key: "netflix",
        label: "Netflix",
        url: "https://www.netflix.com/search?q=Operasyon%3A%20Argo",
      },
      {
        key: "prime_video",
        label: "Prime Video",
        url: "https://www.primevideo.com/search/ref=atv_nb_sr?phrase=Operasyon%3A%20Argo",
      },
    ]);
  });

  it("Disney+ için gerçek yayın sitesinin arama ekranını açar", () => {
    expect(telepartyProviderLaunches("Film", ["disney_plus"])[0]).toEqual({
      key: "disney_plus",
      label: "Disney+",
      url: "https://www.disneyplus.com/search",
    });
  });

  it("yalnız desteklenmeyen sağlayıcılar veya boş başlık için hedef üretmez", () => {
    expect(telepartyProviderLaunches("Film", ["mubi", "blutv"])).toEqual([]);
    expect(telepartyProviderLaunches("   ", ["netflix"])).toEqual([]);
  });
});
