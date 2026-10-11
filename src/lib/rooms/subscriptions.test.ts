import { describe, expect, it } from "vitest";

import {
  MAX_SUBSCRIPTIONS,
  SUBSCRIPTION_OPTIONS,
  normalizeSubscriptionSelection,
  parseStoredSubscriptions,
  relaxedSubscriptionTiers,
  sharedSubscriptions,
  sharedSubscriptionsForAll,
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

  it("üç veya daha fazla katılımcının ortak aboneliğini hesaplar", () => {
    expect(
      sharedSubscriptionsForAll([
        ["netflix", "prime_video", "mubi"],
        ["netflix", "mubi"],
        ["disney_plus", "netflix"],
      ]),
    ).toEqual(["netflix"]);
    expect(sharedSubscriptionsForAll([["netflix"]])).toEqual([]);
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

describe("kademeli platform esnetme", () => {
  it("iki kişilik odada yalnız ortak platformları döndürür", () => {
    expect(
      relaxedSubscriptionTiers([
        ["netflix", "mubi"],
        ["netflix", "prime_video"],
      ]),
    ).toEqual([["netflix"]]);
    expect(relaxedSubscriptionTiers([["netflix"], ["mubi"]])).toEqual([]);
  });

  it("kalabalık odada herkesten çoğunluğa doğru genişler ve tekrarı atlar", () => {
    const tiers = relaxedSubscriptionTiers([
      ["netflix", "prime_video", "mubi"],
      ["netflix", "prime_video"],
      ["netflix", "prime_video"],
      ["netflix", "disney_plus"],
      ["prime_video", "disney_plus"],
    ]);
    // 5 kişi: herkes (5) → 4 → 3 (çoğunluk). MUBI (1) ve Disney+ (2) hiç girmez.
    expect(tiers).toEqual([["netflix", "prime_video"]]);
  });

  it("herkeste ortak platform yoksa çoğunluğun platformlarına iner", () => {
    const tiers = relaxedSubscriptionTiers([
      ["netflix"],
      ["netflix", "prime_video"],
      ["prime_video", "mubi"],
    ]);
    // 3 kişi: herkes (3) boş → çoğunluk (2): Netflix ve Prime Video.
    expect(tiers).toEqual([["netflix", "prime_video"]]);
  });

  it("basamakları dar kümeden geniş kümeye sıralar", () => {
    const tiers = relaxedSubscriptionTiers([
      ["netflix", "prime_video", "mubi"],
      ["netflix", "prime_video", "mubi"],
      ["netflix", "prime_video"],
      ["netflix"],
    ]);
    // 4 kişi: herkes (4) Netflix → 3 kişi Netflix+Prime (çoğunluk 3).
    expect(tiers).toEqual([["netflix"], ["netflix", "prime_video"]]);
  });
});
