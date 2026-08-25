import { describe, expect, it } from "vitest";

import { normalizeRoomError, roomError, type RoomErrorCode } from "./errors";

const DATABASE_CONTRACT: readonly RoomErrorCode[] = [
  "unauthenticated",
  "invalid_invitation",
  "invitation_expired",
  "invitation_already_used",
  "room_full",
  "host_cannot_join",
  "room_closed",
  "round_not_ready",
  "round_closed_for_votes",
  "invalid_round_candidate",
  "invalid_candidates",
  "candidate_pool_incomplete",
  "invalid_selection",
  "selection_expired",
];

describe("normalizeRoomError — veritabanı sözleşmesi", () => {
  it("her sabit hata mesajını kendi koduna çevirir", () => {
    for (const code of DATABASE_CONTRACT) {
      expect(normalizeRoomError({ message: code }).code).toBe(code);
    }
  });

  it("baştaki/sondaki boşluğu tolere eder", () => {
    expect(normalizeRoomError({ message: "  room_full  " }).code).toBe(
      "room_full",
    );
  });

  it("invalid_token_hash'i genel invalid_invitation'a indirger", () => {
    // Davetin var olup olmadığı hakkında bilgi sızdırmamak için.
    expect(normalizeRoomError({ message: "invalid_token_hash" }).code).toBe(
      "invalid_invitation",
    );
  });

  it("düz metin hata dizesini de kabul eder", () => {
    expect(normalizeRoomError("invitation_expired").code).toBe(
      "invitation_expired",
    );
  });
});

describe("normalizeRoomError — sızıntı önleme", () => {
  it("ham SQL ayrıntısını kullanıcıya iletmez", () => {
    const pgError = {
      message:
        'duplicate key value violates unique constraint "participants_unique_role_per_space"',
      details: "Key (space_id, role)=(abc, guest) already exists.",
      hint: "table public.participants",
      code: "23505",
    };

    const normalized = normalizeRoomError(pgError);

    expect(normalized.code).toBe("unexpected");
    expect(normalized.message).not.toContain("participants");
    expect(normalized.message).not.toContain("unique constraint");
    expect(normalized.message).not.toContain("space_id");
    expect(normalized.message).not.toContain("23505");
  });

  it("hata metninde geçen davet token'ını yankılamaz", () => {
    const token = "S3cr3tT0ken".repeat(4);
    const normalized = normalizeRoomError({
      message: `invalid input for token ${token}`,
    });

    expect(normalized.message).not.toContain(token);
    expect(normalized.code).toBe("unexpected");
  });

  it("token hash'ini yankılamaz", () => {
    const hash = "a".repeat(64);
    const normalized = normalizeRoomError({ message: `token_hash=${hash}` });

    expect(normalized.message).not.toContain(hash);
  });

  it("mesajlar daima sabit sözlükten gelir", () => {
    const inputs: unknown[] = [
      null,
      undefined,
      42,
      [],
      {},
      { message: 12 },
      { message: "rastgele bir sunucu hatası" },
      new Error("boom"),
    ];

    const known = new Set(
      (
        [
          ...DATABASE_CONTRACT,
          "not_configured",
          "network",
          "unexpected",
        ] as RoomErrorCode[]
      ).map((code) => roomError(code).message),
    );

    for (const input of inputs) {
      expect(known.has(normalizeRoomError(input).message)).toBe(true);
    }
  });
});

describe("normalizeRoomError — RoomError biçiminde fırlatılan değerler", () => {
  // Yerel oda deposu (`localStore.ts`) doğrudan `roomError(...)` nesnesi
  // fırlatıyor. Bunlar kendi kodlarını korumalı, `unexpected`'a düşmemeli.
  it("kod taşıyan nesnenin kodunu korur", () => {
    for (const code of DATABASE_CONTRACT) {
      expect(normalizeRoomError(roomError(code)).code).toBe(code);
    }
  });

  it("mesajı gelen nesneden değil, sözlükten alır", () => {
    const tampered = {
      code: "room_full",
      message: "SQL detayı: relation participants line 42",
    };

    const normalized = normalizeRoomError(tampered);

    expect(normalized.code).toBe("room_full");
    expect(normalized.message).toBe(roomError("room_full").message);
    expect(normalized.message).not.toContain("SQL");
    expect(normalized.message).not.toContain("participants");
  });

  it("tanınmayan kodu unexpected'a indirger", () => {
    expect(normalizeRoomError({ code: "made_up_code" }).code).toBe("unexpected");
  });

  it("kod alanı metin değilse mesaj yoluna düşer", () => {
    expect(normalizeRoomError({ code: 42, message: "room_full" }).code).toBe(
      "room_full",
    );
  });
});

describe("normalizeRoomError — diğer sınıflandırmalar", () => {
  it("yapılandırma hatasını tanır", () => {
    expect(
      normalizeRoomError({ code: "not_configured", message: "her neyse" }).code,
    ).toBe("not_configured");
  });

  it("ağ hatasını tanır", () => {
    const networkError = new TypeError("fetch failed");
    expect(normalizeRoomError(networkError).code).toBe("network");
  });

  it("bilinmeyen her şeyi unexpected'a indirger", () => {
    expect(normalizeRoomError(new Error("bilinmeyen")).code).toBe("unexpected");
    expect(normalizeRoomError(null).code).toBe("unexpected");
    expect(normalizeRoomError(undefined).code).toBe("unexpected");
  });

  it("her kod için boş olmayan Türkçe mesaj üretir", () => {
    for (const code of DATABASE_CONTRACT) {
      const { message } = roomError(code);
      expect(message.length).toBeGreaterThan(0);
    }
  });
});
