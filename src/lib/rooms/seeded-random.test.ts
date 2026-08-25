import { describe, expect, it } from "vitest";

import { seededShuffle } from "./seeded-random";

describe("seededShuffle", () => {
  const values = Array.from({ length: 20 }, (_, index) => index + 1);

  it("aynı seed ve girdide aynı sırayı verir", () => {
    expect(seededShuffle(values, "same-seed")).toEqual(
      seededShuffle(values, "same-seed"),
    );
  });

  it("farklı seed'ler farklı sıra üretebilir", () => {
    expect(seededShuffle(values, "seed-a")).not.toEqual(
      seededShuffle(values, "seed-b"),
    );
  });

  it("girdi kümesini değiştirmez", () => {
    expect([...seededShuffle(values, "audit")].sort((a, b) => a - b)).toEqual(values);
  });
});
