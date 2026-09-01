import { describe, expect, it } from "vitest";

import {
  computeScrollbarCompensation,
  FOCUSABLE_SELECTOR,
  formatRuntime,
  lockBodyScroll,
  resolveFocusTrapTarget,
  type ScrollLockTarget,
  shouldCloseOnBackdropClick,
  stateForMovie,
} from "./modal";

/** `document` + `window` yerine geçen en küçük sahte yüzey. */
function scrollTarget(
  overrides: {
    overflow?: string;
    paddingRight?: string;
    innerWidth?: number;
    clientWidth?: number;
  } = {},
): ScrollLockTarget {
  return {
    body: {
      style: {
        overflow: overrides.overflow ?? "",
        paddingRight: overrides.paddingRight ?? "",
      },
    },
    documentElement: { clientWidth: overrides.clientWidth ?? 1005 },
    innerWidth: overrides.innerWidth ?? 1020,
  };
}

describe("shouldCloseOnBackdropClick — yalnız arka plan kapatır", () => {
  const backdrop = { id: "backdrop" };
  const content = { id: "content" };

  it("arka planın kendisine tıklanınca kapatır", () => {
    expect(shouldCloseOnBackdropClick(backdrop, backdrop)).toBe(true);
  });

  it("modal içeriğine tıklanınca KAPATMAZ", () => {
    expect(shouldCloseOnBackdropClick(content, backdrop)).toBe(false);
  });

  it("içerikten köpüren olay arka plana ulaşsa bile kapatmaz", () => {
    // Olayın `target` değeri içerik olduğu sürece, olayı arka plan dinlese de
    // kapanma olmamalıdır.
    const nested = { id: "nested-button" };
    expect(shouldCloseOnBackdropClick(nested, backdrop)).toBe(false);
  });

  it("arka plan henüz bağlanmamışsa kapatmaz", () => {
    expect(shouldCloseOnBackdropClick(backdrop, null)).toBe(false);
    expect(shouldCloseOnBackdropClick(null, null)).toBe(false);
  });
});

describe("computeScrollbarCompensation", () => {
  it("kaydırma çubuğu genişliğini döndürür", () => {
    expect(computeScrollbarCompensation(1020, 1005)).toBe(15);
  });

  it("çubuk yer kaplamıyorsa sıfır döndürür", () => {
    expect(computeScrollbarCompensation(390, 390)).toBe(0);
  });

  it("negatif farkı sıfıra kırpar", () => {
    expect(computeScrollbarCompensation(1000, 1020)).toBe(0);
  });

  it("sayısal olmayan ölçüde sıfır döndürür", () => {
    expect(computeScrollbarCompensation(Number.NaN, 1005)).toBe(0);
    expect(computeScrollbarCompensation(1020, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("lockBodyScroll — kilit ve temizlik", () => {
  it("kaydırmayı kilitler ve layout kaymasını telafi eder", () => {
    const target = scrollTarget();

    lockBodyScroll(target);

    expect(target.body.style.overflow).toBe("hidden");
    expect(target.body.style.paddingRight).toBe("15px");
  });

  it("temizlik ÖNCEKİ değerleri tam olarak geri yükler", () => {
    const target = scrollTarget({
      overflow: "auto",
      paddingRight: "8px",
    });

    const release = lockBodyScroll(target);
    release();

    expect(target.body.style.overflow).toBe("auto");
    expect(target.body.style.paddingRight).toBe("8px");
  });

  it("satır içi stil yoksa boş değeri geri yükler", () => {
    const target = scrollTarget();

    lockBodyScroll(target)();

    expect(target.body.style.overflow).toBe("");
    expect(target.body.style.paddingRight).toBe("");
  });

  it("çubuk yer kaplamıyorsa padding'e dokunmaz", () => {
    const target = scrollTarget({ innerWidth: 390, clientWidth: 390 });

    lockBodyScroll(target);

    expect(target.body.style.overflow).toBe("hidden");
    expect(target.body.style.paddingRight).toBe("");
  });

  it("temizlik iki kez çağrılsa da bozulmaz", () => {
    const target = scrollTarget({ overflow: "auto", paddingRight: "8px" });

    const release = lockBodyScroll(target);
    release();

    // İkinci kilit, ilk temizlik sonrası devreye girer.
    const secondRelease = lockBodyScroll(target);
    release(); // eski temizlik tekrar çağrılıyor — etkisiz olmalı

    expect(target.body.style.overflow).toBe("hidden");

    secondRelease();
    expect(target.body.style.overflow).toBe("auto");
    expect(target.body.style.paddingRight).toBe("8px");
  });
});

describe("resolveFocusTrapTarget — odak tuzağı", () => {
  const [close, link, action] = ["close", "link", "action"];
  const focusable = [close, link, action];

  it("son öğeden ileri sekme ilk öğeye sarar", () => {
    expect(resolveFocusTrapTarget(focusable, action, false)).toBe(close);
  });

  it("ilk öğeden geri sekme son öğeye sarar", () => {
    expect(resolveFocusTrapTarget(focusable, close, true)).toBe(action);
  });

  it("ortadaki öğelerde tarayıcı sırasına karışmaz", () => {
    expect(resolveFocusTrapTarget(focusable, link, false)).toBeNull();
    expect(resolveFocusTrapTarget(focusable, link, true)).toBeNull();
  });

  it("odak modal dışındaysa içeri geri çeker", () => {
    expect(resolveFocusTrapTarget(focusable, "arka-plandaki-buton", false)).toBe(
      close,
    );
    expect(resolveFocusTrapTarget(focusable, "arka-plandaki-buton", true)).toBe(
      action,
    );
    expect(resolveFocusTrapTarget(focusable, null, false)).toBe(close);
  });

  it("tek odaklanabilir öğede odağı orada tutar", () => {
    expect(resolveFocusTrapTarget([close], close, false)).toBe(close);
    expect(resolveFocusTrapTarget([close], close, true)).toBe(close);
  });

  it("odaklanabilir öğe yoksa null döner", () => {
    expect(resolveFocusTrapTarget([], null, false)).toBeNull();
  });
});

describe("FOCUSABLE_SELECTOR", () => {
  it("devre dışı ve tabindex=-1 öğeleri dışarıda bırakır", () => {
    expect(FOCUSABLE_SELECTOR).toContain("button:not([disabled])");
    expect(FOCUSABLE_SELECTOR).toContain('[tabindex]:not([tabindex="-1"])');
    expect(FOCUSABLE_SELECTOR).toContain(":not([hidden])");
  });
});

describe("stateForMovie — bayat yanıt koruması", () => {
  type TestState =
    | { status: "loading" }
    | { status: "success"; title: string };

  const loading: TestState = { status: "loading" };
  const inception: TestState = { status: "success", title: "Başlangıç" };

  it("kayıt yokken yükleniyor durumunu verir", () => {
    expect(stateForMovie<TestState>(null, 27205, loading)).toBe(loading);
  });

  it("kayıt aynı filme aitse sonucu gösterir", () => {
    expect(
      stateForMovie<TestState>({ movieId: 27205, state: inception }, 27205, loading),
    ).toBe(inception);
  });

  it("film değiştiyse ESKİ sonucu göstermez", () => {
    // Kullanıcı hızlıca başka bir filme geçti; önceki istek şimdi tamamlandı.
    expect(
      stateForMovie<TestState>({ movieId: 27205, state: inception }, 550, loading),
    ).toBe(loading);
  });

  it("geç gelen eski yanıt yeni filmin ekranını boyayamaz", () => {
    let outcome: { movieId: number; state: TestState } | null = null;
    let current = 27205;

    // Kullanıcı 550'ye geçiyor.
    current = 550;
    // 27205 için başlatılmış istek ŞİMDİ tamamlanıyor.
    outcome = { movieId: 27205, state: inception };

    expect(stateForMovie<TestState>(outcome, current, loading)).toBe(loading);
  });

  it("aynı başlıklı farklı TMDb kayıtlarını karıştırmaz", () => {
    // İki kayıt da "Esaretin Bedeli"; ayrım yalnızca TMDb ID ile yapılır.
    const first: TestState = { status: "success", title: "Esaretin Bedeli" };

    expect(stateForMovie<TestState>({ movieId: 238, state: first }, 238, loading)).toBe(
      first,
    );
    expect(stateForMovie<TestState>({ movieId: 238, state: first }, 278, loading)).toBe(
      loading,
    );
  });
});

describe("formatRuntime", () => {
  it("saat ve dakikayı birlikte biçimlendirir", () => {
    expect(formatRuntime(148)).toBe("2s 28dk");
  });

  it("tam saatte dakika göstermez", () => {
    expect(formatRuntime(120)).toBe("2s");
  });

  it("bir saatin altında yalnız dakika gösterir", () => {
    expect(formatRuntime(47)).toBe("47dk");
  });

  it("geçersiz sürede null döner", () => {
    expect(formatRuntime(null)).toBeNull();
    expect(formatRuntime(0)).toBeNull();
    expect(formatRuntime(-10)).toBeNull();
    expect(formatRuntime(90.5)).toBeNull();
  });
});
