import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTtlCache } from "./ttl-cache";

describe("createTtlCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("yazılan değeri geri okur", () => {
    const cache = createTtlCache<string>({ ttlMs: 1000, maxEntries: 10 });
    cache.set("a", "value");

    expect(cache.get("a")).toBe("value");
  });

  it("olmayan anahtar için undefined döner", () => {
    const cache = createTtlCache<string>({ ttlMs: 1000, maxEntries: 10 });

    expect(cache.get("yok")).toBeUndefined();
  });

  it("TTL dolmadan hemen önce değeri korur", () => {
    const cache = createTtlCache<string>({ ttlMs: 1000, maxEntries: 10 });
    cache.set("a", "value");

    vi.advanceTimersByTime(999);

    expect(cache.get("a")).toBe("value");
  });

  it("TTL dolduğunda değeri düşürür", () => {
    const cache = createTtlCache<string>({ ttlMs: 1000, maxEntries: 10 });
    cache.set("a", "value");

    vi.advanceTimersByTime(1000);

    expect(cache.get("a")).toBeUndefined();
  });

  it("süresi dolmuş kaydı okunduğunda siler", () => {
    const cache = createTtlCache<string>({ ttlMs: 1000, maxEntries: 10 });
    cache.set("a", "value");

    vi.advanceTimersByTime(5000);
    expect(cache.get("a")).toBeUndefined();

    // Süre ilerlemesi geri alınmadığı için kayıt kalıcı olarak gitmiştir.
    expect(cache.get("a")).toBeUndefined();
  });

  it("her kayıt kendi yazılma anına göre süre dolumu yaşar", () => {
    const cache = createTtlCache<string>({ ttlMs: 1000, maxEntries: 10 });

    cache.set("ilk", "1");
    vi.advanceTimersByTime(600);
    cache.set("ikinci", "2");

    // ilk: 600ms yaşında, ikinci: 0ms
    vi.advanceTimersByTime(500); // ilk: 1100ms (dolmuş), ikinci: 500ms
    expect(cache.get("ilk")).toBeUndefined();
    expect(cache.get("ikinci")).toBe("2");
  });

  it("maxEntries aşıldığında en eski kaydı düşürür", () => {
    const cache = createTtlCache<string>({ ttlMs: 60_000, maxEntries: 3 });

    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("c", "3");
    cache.set("d", "4"); // sınır aşıldı; en eski ("a") düşer

    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe("2");
    expect(cache.get("c")).toBe("3");
    expect(cache.get("d")).toBe("4");
  });

  it("tahliye sırasında önce süresi dolmuş kayıtları temizler", () => {
    const cache = createTtlCache<string>({ ttlMs: 1000, maxEntries: 2 });

    cache.set("eski", "1");
    vi.advanceTimersByTime(1500); // "eski" süresi doldu
    cache.set("yeni", "2");
    cache.set("daha-yeni", "3"); // sınıra gelindi; süresi dolan temizlenir

    expect(cache.get("eski")).toBeUndefined();
    expect(cache.get("yeni")).toBe("2");
    expect(cache.get("daha-yeni")).toBe("3");
  });

  it("aynı anahtara yazınca değeri ve süreyi tazeler", () => {
    const cache = createTtlCache<string>({ ttlMs: 1000, maxEntries: 10 });

    cache.set("a", "ilk");
    vi.advanceTimersByTime(900);
    cache.set("a", "ikinci");

    vi.advanceTimersByTime(500); // ilk yazımdan 1400ms, ikinciden 500ms
    expect(cache.get("a")).toBe("ikinci");
  });

  it("clear() tüm kayıtları siler", () => {
    const cache = createTtlCache<string>({ ttlMs: 60_000, maxEntries: 10 });
    cache.set("a", "1");
    cache.set("b", "2");

    cache.clear();

    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBeUndefined();
  });
});
