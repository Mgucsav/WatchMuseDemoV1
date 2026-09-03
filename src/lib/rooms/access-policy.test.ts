import { describe, expect, it } from "vitest";

import { requiresRegisteredRoomAccount } from "./access-policy";

describe("oda hesap erişim politikası", () => {
  it("private odalarda kayıtlı hesap istemez", () => {
    expect(requiresRegisteredRoomAccount("private")).toBe(false);
  });

  it("public odalarda kayıtlı hesap ister", () => {
    expect(requiresRegisteredRoomAccount("public")).toBe(true);
  });
});
