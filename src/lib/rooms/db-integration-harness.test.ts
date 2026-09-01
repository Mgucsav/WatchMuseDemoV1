import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Bu dosya gerçek veritabanı entegrasyon harness'ının DEPODA VAR OLDUĞUNU ve
 * tam olduğunu doğrular. Harness'ı ÇALIŞTIRMAZ.
 *
 * Ayrım kasıtlıdır: `reusable-round-migration.test.ts` SQL *metnini* okur ve
 * entegrasyon testi değildir. Kısıt semantiği, transaction davranışı, kilit
 * yarışları, RLS ve grant'ler yalnızca gerçek bir PostgreSQL üzerinde
 * kanıtlanabilir. Aşağıdaki `todo` girdileri, o senaryoların ÇALIŞTIRILMADIĞINI
 * `npm test` çıktısında görünür kılar.
 */

const TESTS_DIR = join(process.cwd(), "supabase", "tests");
const SQL_DIR = join(TESTS_DIR, "sql");

function readHarness(relativePath: string): string {
  return readFileSync(join(TESTS_DIR, relativePath), "utf8");
}

const SQL_FILES = [
  "00_migration_chain.sql",
  "01_helpers.sql",
  "02_upgrade_from_legacy.sql",
  "03_round_lifecycle.sql",
  "04_acceptance.sql",
  "05_eligibility_boundaries.sql",
  "06_input_validation.sql",
  "07_authorization_privacy.sql",
  "08_subscription_intersection.sql",
] as const;

describe("gerçek veritabanı harness'ı — dosya bütünlüğü", () => {
  it.each(SQL_FILES)("%s depoda mevcut ve boş değil", (file) => {
    const sql = readFileSync(join(SQL_DIR, file), "utf8");
    expect(sql.trim().length).toBeGreaterThan(200);
  });

  it("iki koşucu da mevcut", () => {
    expect(readHarness("run-integration-tests.sh").length).toBeGreaterThan(200);
    expect(readHarness("run-integration-tests.ps1").length).toBeGreaterThan(200);
  });

  it("koşucular bağlantı adresini ortam değişkeninden alır, koda gömmez", () => {
    for (const runner of ["run-integration-tests.sh", "run-integration-tests.ps1"]) {
      const source = readHarness(runner);
      expect(source).toContain("WATCHMUSE_TEST_DATABASE_URL");
      expect(source).not.toMatch(/postgres(ql)?:\/\/[^"'\s]*:[^"'\s]*@/);
    }
  });

  it("koşucular yönetilen Supabase adresine bağlanmayı reddeder", () => {
    for (const runner of ["run-integration-tests.sh", "run-integration-tests.ps1"]) {
      expect(readHarness(runner)).toContain("supabase.co");
    }
  });

  it("hiçbir harness dosyasında gerçek kimlik bilgisi yok", () => {
    for (const file of SQL_FILES) {
      const sql = readFileSync(join(SQL_DIR, file), "utf8");
      expect(sql).not.toMatch(/service_role_key/i);
      expect(sql).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
      expect(sql).not.toContain("supabase.co");
    }
  });

  it("README çalıştırma durumunu ÇALIŞTIRILMADI olarak bildirir", () => {
    const readme = readHarness("README.md");
    expect(readme).toContain("ÇALIŞTIRILMADI");
    expect(readme).toContain("WATCHMUSE_TEST_DATABASE_URL");
  });

  it("eşzamanlılık senaryoları tek oturumda kapsanmadığı için açıkça işaretli", () => {
    const lifecycle = readFileSync(join(SQL_DIR, "03_round_lifecycle.sql"), "utf8");
    expect(lifecycle).toContain("İKİ OTURUM GEREKTİREN YARIŞLAR");
    expect(readHarness("README.md")).toContain("elle, iki oturum");
  });
});

/**
 * ÇALIŞTIRILMADI — gerçek PostgreSQL gerekiyor.
 *
 * Bu makinede `docker`, `psql`, `supabase` CLI ve yerel PostgreSQL kurulu
 * değildir; sistem yazılımı kurmak açık onay gerektirdiği için kurulum
 * yapılmamıştır. Aşağıdaki senaryolar depoda YAZILI ama ÇALIŞTIRILMAMIŞTIR.
 *
 * Çalıştırmak için: supabase/tests/README.md
 */
describe("gerçek veritabanı entegrasyon senaryoları — NOT RUN", () => {
  it.todo("01 · boş veritabanında tam migration zinciri");
  it.todo("02 · production benzeri legacy şemadan yükseltme");
  it.todo("03 · legacy active / result / no_match backfill");
  it.todo("04 · iki eşzamanlı tur başlatma (iki oturum, elle)");
  it.todo("05 · iki eşzamanlı çark (iki oturum, elle)");
  it.todo("06 · aynı kullanıcının tekrarlı kabulü");
  it.todo("07 · iki kullanıcının ardışık kabulü");
  it.todo("08 · mevcut watched kütüphane kaydının korunması");
  it.todo("09 · tam 7 / 14 / 30 gün sınırları");
  it.todo("10 · iki veya daha eski turda görülmüş film");
  it.todo("11 · tam 10 benzersiz aday + en az 1 gerçek keşif");
  it.todo("12 · bozuk aday JSON'u → tanımlı domain hatası");
  it.todo("13 · üye A / üye B / yabancı yetkilendirmesi");
  it.todo("14 · authenticated ile doğrudan güvenilen RPC çağrısı başarısız olmalı");
  it.todo("15 · partner verisinin sızmaması");
  it.todo("16 · SECURITY DEFINER + search_path davranışı");
  it.todo("17 · ortak abonelik kümesi turla saklanır, boş küme reddedilir");
  it.todo("18 · daralan ortak kümede eski turun filmi tekrar edilemez");
  it.todo("19 · katılımcı yalnızca KENDİ abonelik beyanını güncelleyebilir");
});
