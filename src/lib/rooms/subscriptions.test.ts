import { describe, expect, it } from "vitest";

import {
  MAX_SUBSCRIPTIONS,
  SUBSCRIPTION_OPTIONS,
  normalizeSubscriptionSelection,
  parseStoredSubscriptions,
  sharedSubscriptions,
  subscriptionLabel,
  tmdbProviderIdsFor,
} from "./subscriptions";

describe("oda abonelikleri", () => {
  it("geçerli seçimi tekilleştirip katalog sırasına koyar", () => {
    expect(
      normalizeSubscriptionSelection(["prime_video", "netflix", "netflix"]),
    ).toEqual(["netflix", "prime_video"]);
  });

  it("boş, dizi olmayan veya tanınmayan seçimi tamamen reddeder", () => {
    expect(normalizeSubscriptionSelection([])).toBeNull();
    expect(normalizeSubscriptionSelection("netflix")).toBeNull();
    expect(normalizeSubscriptionSelection(null)).toBeNull();
    // Tanınmayan anahtar sessizce atılmaz: seçim bütünüyle reddedilir.
    expect(normalizeSubscriptionSelection(["netflix", "korsan_tv"])).toBeNull();
    expect(
      normalizeSubscriptionSelection(
        Array.from({ length: MAX_SUBSCRIPTIONS + 1 }, () => "netflix"),
      ),
    ).toBeNull();
  });

  it("saklanan listede tanınmayan anahtarı düşürür ama listeyi korur", () => {
    expect(parseStoredSubscriptions(["mubi", "kaldirilmis", "netflix"])).toEqual([
      "netflix",
      "mubi",
    ]);
    expect(parseStoredSubscriptions(null)).toEqual([]);
  });

  it("ortak abonelikleri katalog sırasında verir", () => {
    expect(
      sharedSubscriptions(
        ["netflix", "prime_video", "mubi"],
        ["mubi", "netflix", "disney_plus"],
      ),
    ).toEqual(["netflix", "mubi"]);

    expect(sharedSubscriptions(["netflix"], ["mubi"])).toEqual([]);
  });

  it("ortak platformların TMDb ID'lerini reklamlı varyantlarıyla verir", () => {
    // Netflix 8 + reklamlı 1796, Prime Video 119 + reklamlı 2100.
    expect(tmdbProviderIdsFor(["netflix", "prime_video"])).toEqual([
      8, 119, 1796, 2100,
    ]);
    expect(tmdbProviderIdsFor([])).toEqual([]);
  });

  it("katalog etiketleri tekildir ve her anahtar için bir etiket vardır", () => {
    const labels = SUBSCRIPTION_OPTIONS.map((option) => option.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const option of SUBSCRIPTION_OPTIONS) {
      expect(subscriptionLabel(option.key)).toBe(option.label);
    }
  });
});
