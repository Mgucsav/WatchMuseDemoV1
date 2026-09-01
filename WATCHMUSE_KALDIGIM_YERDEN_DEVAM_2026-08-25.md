# WatchMuse — Kaldığım Yerden Devam

**Son güncelleme:** 2026-08-25
**Amaç:** Bu dosya tek başına okunduğunda projeye sıfırdan devam edebilmeni
sağlar. Hangi noktada olduğun, neyin çalıştığı, neyin **doğrulanmadığı** ve
sıradaki adımın ne olduğu burada.

> Yeni bir oturuma başlarken: **önce bu dosyayı oku**, sonra §9'daki
> "sıradaki iş"ten devam et.

---

## 1. Tek paragraflık durum

WatchMuse, iki kişinin birlikte film seçmesi için yazılmış bir Next.js 16 +
TypeScript uygulaması. Film arama, kişisel kütüphane, iki kişilik oda + davet,
10 filmlik oy turu ve ortak çark **kod olarak tamamlandı**. Son iki iş dilimi
(yeniden kullanılabilir oda düzeltmeleri ve film detay modalı) da bitti ve tüm
yerel doğrulamalar temiz. **Kritik açık nokta:** yeniden kullanılabilir oda
migration'ı **henüz uygulanmadı** ve veritabanı davranışı gerçek bir PostgreSQL
üzerinde **hiç test edilmedi**.

---

## 2. Nerede duruyorsun

| | |
| --- | --- |
| Dal | `feature/reusable-room-candidates` |
| Son commit | `1de436d wip: preserve reusable room implementation before remediation` |
| Çalışma ağacı | **Kirli** — iki iş diliminin tamamı commit edilmemiş durumda |
| Migration | `20260813000100_reusable_rounds.sql` **UYGULANMADI** |
| Sıradaki doğal adım | Yerel checkpoint commit (§9.1) |

Her iki iş dilimi de "commit etme" talimatıyla yapıldı; bu yüzden çalışma
ağacında duruyorlar. İçerikleri kaybetmemek için **ilk iş commit almak**.

### Son doğrulama sonuçları (2026-08-25)

```
npm test              → 23 dosya / 294 test geçti | 16 todo
npm run typecheck     → temiz
npm run lint          → temiz
npm run build         → 21 route, hata yok
npm audit --omit=dev  → 0 vulnerabilities
```

16 `todo`, **bilinçli olarak çalıştırılmamış** veritabanı senaryolarıdır (§5).

---

## 3. Neler çalışıyor

- **Film arama** — gerçek TMDb `search/movie`. Türkçe/İngilizce arama aynı filmi
  getirir (dil sabit `tr-TR`; TMDb zaten tüm çevirilerde eşleştirir).
- **Sağlayıcı kontrolü** — Netflix / Prime Video, yalnız TR `flatrate`,
  provider ID eşleşmesi. Kiralama/satın alma bilinçli olarak sayılmaz.
- **Film detay modalı** — arama sonucundan açılır; künye, yönetmen, tür, süre,
  özet ve abonelik durumu tek uçtan gelir. *(Bu oturumda tamamlandı.)*
- **Kimlik** — Supabase anonim oturum, sonradan hesaba bağlama.
- **Kişisel kütüphane** — izleme listesi / izlenenler.
- **Oda + davet** — iki kişi sınırı, tek kullanımlık token, hash'lenmiş saklama.
- **Oy turu + ortak çark** — 10 aday, gizli oylama, kazananı veritabanı seçer.
- **Yeniden kullanılabilir turlar** — geçmiş silinmez, 30/14/7 günlük uygunluk
  kuralları. *(Kod hazır, DB'de doğrulanmadı.)*

### Gizli değerler

Depoda hiçbir gerçek anahtar yok. `.env.local` git tarafından izlenmiyor ve bu
oturumların hiçbirinde okunmadı.

Gereken değişkenler (`.env.example` içinde adlarıyla belgeli):

```
TMDB_ACCESS_TOKEN              gizli · yalnız sunucu
SUPABASE_SERVICE_ROLE_KEY      gizli · yalnız sunucu · YENİ, artık zorunlu
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SITE_URL
```

`TMDB_ACCESS_TOKEN=DEMO` anahtarsız önizleme modunu açar (sahte veri, TMDb'ye
istek gitmez).

---

## 4. Bu iki oturumda ne yapıldı

### 4.1 Reusable room remediation (Phase A)

Rapor: [WATCHMUSE_REUSABLE_ROOM_REMEDIATION_REPORT_2026-08-25.md](WATCHMUSE_REUSABLE_ROOM_REMEDIATION_REPORT_2026-08-25.md)

| Kod | Neydi | Ne yapıldı |
| --- | --- | --- |
| RR-01 | Keşif sınırı yalnız bir önceki turu dışlıyordu; `selection_reason` sonradan çıkarımla üretiliyordu | `seen_before` CTE'si **tüm geçmişi** dışlıyor; reason'ı seçen geçiş yazıyor; priority+repeat ≤ 9 slot, ≥1 gerçek keşif garantisi |
| RR-02 | Aday planını yazan RPC `authenticated` rolüne açıktı | Yalnız `service_role`; aktör kimliği açıkça geçiliyor ve SQL'de bağımsız doğrulanıyor; `server-only` admin istemcisi |
| RR-03 | Eski RPC kalıcı bir authenticated kapı olarak duruyordu | EXECUTE geri alındı; gövde `round_creation_moved` fırlatıyor |
| D | Regex+cast boolean ifadeleri, eksik ilişkisel bütünlük | Cast'ler regex-korumalı `CASE` içine alındı; 3 composite kısıt eklendi |
| E | Terminal istemci bayat kalıyordu | Terminal 30 sn yenileme, sınırlı yeniden deneme, seçim süresi göstergesi |
| F | nanoid GHSA-2v37-7h3g-55p8 | Tek satırlık override → 0 vulnerabilities |
| G | Gerçek DB test harness'ı | **Yazıldı, ÇALIŞTIRILMADI** (§5) |
| H | Dokümantasyon | Mimari + kurulum + `.env.example` güncellendi |

### 4.2 MovieDetailModal V1

Rapor: [WATCHMUSE_MOVIE_DETAIL_MODAL_IMPLEMENTATION_REPORT_2026-08-25.md](WATCHMUSE_MOVIE_DETAIL_MODAL_IMPLEMENTATION_REPORT_2026-08-25.md)

- `GET /api/movies/<tmdbId>` — künye + credits + sağlayıcı tek yanıtta
- Yönetmen `job === "Director"` ile çıkarılıyor (`department` tuzağından kaçınıldı)
- Portal, blur backdrop, focus trap, scroll lock, Escape, aspect-ratio rezervasyonu
- Üç katmanlı bayat-yanıt koruması; kimlik her zaman TMDb ID
- `ProviderPanel` korundu, sunumu `ProviderAvailability.tsx` ile paylaşılıyor

---

## 5. ⚠️ Doğrulanmamış olanlar — en büyük risk

**Aşağıdakiler "çalışıyor" sayılmamalı.** Kod incelemesi ve statik SQL metin
testi seviyesindeler; gerçek bir veritabanında hiç çalıştırılmadılar:

- RLS politikalarının gerçekten uygulandığı
- `start_next_space_round` üzerindeki service-role sınırının etkili olduğu
- Composite FK ve partial unique index'in beklendiği gibi davrandığı
- Eşzamanlı tur / çark / kabul yarışlarının doğru çözüldüğü
- Migration'ın production benzeri veriyle sorunsuz yükseltildiği

**Sebep:** bu makinede `docker`, `psql`, `supabase` CLI ve yerel PostgreSQL
kurulu değil. Sistem yazılımı kurmak açık onay gerektirdiği için kurulmadı.

Harness depoda hazır: `supabase/tests/` (8 SQL dosyası + iki koşucu + README).
Durum `npm test` çıktısında **16 `todo`** olarak görünüyor —
`src/lib/rooms/db-integration-harness.test.ts`.

Ayrıca modalın tarayıcı davranışları (Escape, focus trap, scroll lock, portal,
responsive) da **NOT RUN** — depoda component test altyapısı yok ve talimat
gereği yeni bağımlılık eklenmedi. 12 maddelik liste modal raporunun §6'sında.

---

## 6. ⚠️ Devreye alma bir bakım penceresi gerektiriyor

RR-03 gereği eski `create_or_reset_space_round` artık hata fırlatıyor. Bu yüzden
**migration uygulandığı andan yeni uygulama sürümü yayına alınana kadar yeni tur
açılamaz.** Devam eden turlarda oylama, çark ve kabul çalışmaya devam eder.

Sıra tam olarak şudur:

| # | Adım | Sonrasındaki durum |
| --- | --- | --- |
| 1 | `SUPABASE_SERVICE_ROLE_KEY` sunucu ortamına eklenir | Değişiklik yok |
| 2 | Bakım penceresi duyurulur | Değişiklik yok |
| 3 | `20260813000100_reusable_rounds.sql` uygulanır | **Yeni tur açma kapalı** |
| 4 | Yeni uygulama sürümü deploy edilir | Yeniden açık |
| 5 | Doğrulama (grant sorguları + bir gerçek tur) | — |
| 6 | Pencere kapatılır | Normal |

Ters sıra (önce deploy) işe yaramaz. Ayrıntı:
[ROOM_SELECTION_AND_WHEEL_SETUP.md](ROOM_SELECTION_AND_WHEEL_SETUP.md) §2.

---

## 7. Proje haritası

```
src/
├── app/
│   ├── api/movies/[id]/route.ts          künye + sağlayıcı  ← YENİ
│   ├── api/movies/[id]/providers/route.ts sağlayıcı (tek başına)
│   ├── api/movies/search/route.ts        arama
│   ├── api/rooms/…                       oda, tur, oy, çark, seçim
│   └── …                                 sayfalar
├── components/
│   ├── MovieSearch.tsx                   arama + modal tetikleyici
│   ├── MovieDetailModal.tsx              detay modalı  ← YENİ
│   ├── ProviderAvailability.tsx          ortak abonelik sunumu  ← YENİ
│   ├── ProviderPanel.tsx                 korundu, şu an render edilmiyor
│   └── rooms/RoomRound.tsx               oy turu + çark
└── lib/
    ├── tmdb/     client · search · providers · details(YENİ) · normalize
    ├── rooms/    round-service · candidate-pipeline · eligibility · polling-policy
    ├── supabase/ server · browser · admin(YENİ, service_role)
    └── ui/       modal.ts (saf modal kuralları)  ← YENİ

supabase/
├── migrations/20260813000100_reusable_rounds.sql   UYGULANMADI
└── tests/                                          harness, ÇALIŞTIRILMADI
```

### Hangi doküman ne için

| Dosya | İçerik |
| --- | --- |
| [docs/ROOMS_ARCHITECTURE.md](docs/ROOMS_ARCHITECTURE.md) | Güven sınırları, RLS, aday politikası, polling — **ana referans** |
| [ROOM_SELECTION_AND_WHEEL_SETUP.md](ROOM_SELECTION_AND_WHEEL_SETUP.md) | Migration ve bakım penceresi adımları, manuel test |
| [AUTH_AND_LIBRARY_SETUP.md](AUTH_AND_LIBRARY_SETUP.md) | Hesap ve kütüphane kurulumu |
| [supabase/tests/README.md](supabase/tests/README.md) | DB harness'ı nasıl çalıştırılır |
| `WATCHMUSE_*_AUDIT.md` | Karar öncesi denetimler (geçmiş kayıt) |
| `WATCHMUSE_*_REPORT_2026-08-25.md` | Son iki iş diliminin raporları |

---

## 8. Değişmez kurallar — bunları bozma

Bu kurallar önceki oturumlarda açıkça konuldu:

1. **Çalışma zamanında sahte film verisi yok.** Tek istisna, `TMDB_ACCESS_TOKEN=DEMO`
   ile açılan açık önizleme modu.
2. **Token'lar hiçbir kaynak dosyaya yazılmaz.** `.env.local` okunmaz,
   yazdırılmaz. Değişken **adları** raporlanabilir, değerleri asla.
3. **`SUPABASE_SERVICE_ROLE_KEY`'in `NEXT_PUBLIC_` karşılığı yoktur** ve asla
   oluşturulmamalıdır.
4. **30 / 14 / 7 günlük uygunluk kuralları havuz doldurmak için gevşetilmez.**
   Uygun film yoksa dürüstçe hata verilir.
5. **Geçmiş append-only'dir.** Tur, aday, oy, seçim ve kabul satırları silinmez.
6. **Partner verisi sızmaz** — oylar, kütüphane, profil, kabul ayrıntıları,
   bastırma nedenleri.
7. **Uygulanmış migration dosyası düzenlenmez.** Değişiklik gerekiyorsa yeni
   migration eklenir.
8. **Doğrulanmayan davranış "doğrulandı" denmez.**

---

## 9. Sıradaki iş — öncelik sırasıyla

### 9.1 Yerel checkpoint commit *(ilk yapılacak)*

Çalışma ağacında iki iş diliminin tamamı duruyor. Kaybetmemek için commit al.

Öneri: iki ayrı commit, çünkü iki bağımsız dilim.

```bash
git add supabase/ src/lib/rooms/ src/lib/supabase/ docs/ .env.example \
        ROOM_SELECTION_AND_WHEEL_SETUP.md package.json package-lock.json \
        src/components/rooms/ WATCHMUSE_REUSABLE_ROOM_REMEDIATION_REPORT_2026-08-25.md
git commit -m "fix(rooms): harden reusable round trust and eligibility boundaries"

git add src/app/api/movies/ src/components/ src/lib/tmdb/ src/lib/ui/ \
        WATCHMUSE_MOVIE_DETAIL_MODAL_IMPLEMENTATION_REPORT_2026-08-25.md
git commit -m "feat(movies): add reusable movie detail modal"
```

> `package.json` / `package-lock.json` değişikliği nanoid override'ıdır ve
> remediation dilimine aittir.

### 9.2 Gerçek veritabanı testleri *(en yüksek değer)*

En büyük belirsizliği kapatan iş bu. Önce kurulum onayı gerekiyor:

```bash
docker run --name watchmuse-test -e POSTGRES_PASSWORD=postgres \
  -p 55432:5432 -d postgres:15

export WATCHMUSE_TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:55432/postgres"
bash supabase/tests/run-integration-tests.sh
```

Sekiz dosyanın da `PASS` vermesi gerekiyor. 4 ve 5 numaralı eşzamanlılık
senaryoları iki ayrı `psql` oturumu ister; prosedür `03_round_lifecycle.sql`
sonunda yazılı.

**Koşucu `supabase.co` içeren adrese bağlanmayı reddeder** — testler şema
düşürür, production'a asla bağlanma.

Geçtikten sonra: harness raporunu güncelle, `db-integration-harness.test.ts`
içindeki `todo`ları gerçek duruma çevir, mimari dokümanındaki "doğrulanmadı"
ifadelerini düzelt.

### 9.3 Modalı tarayıcıda elle doğrula

```bash
npm run dev
```

Arama yap → bir sonuca tıkla. Modal raporunun §6'sındaki 12 maddeyi sırayla
kontrol et: Escape, backdrop tıklaması, içerik tıklaması, Tab tuzağı, kapanışta
odağın açan satıra dönmesi, scroll lock temizliği, mobil/desktop yerleşim.

### 9.4 Migration'ı staging'e uygula

§6'daki bakım penceresi sırasını **staging'de bir kez prova et**, sonra
production. 9.2 geçmeden buraya geçme.

### 9.5 Ertelenmiş: RoomRound + modal entegrasyonu

Modal bu entegrasyona hazır (`movie` + `onClose` dışında varsayımı yok, film
değişimini kendi içinde karşılıyor). Ama önce dört ürün kararı gerekiyor:

1. Modal açıkken oy kısayolları devre dışı mı?
2. Modal açıkken tur durumu değişirse (partner bitirdi, çark döndü) modal
   kapanmalı mı?
3. Oda turu içinde "izleme listeme ekle" görünmeli mi?
4. `room_candidates` satırlarını `MovieSummary`'ye çeviren eşleme.

### 9.6 Daha sonra

- **Recommendation V1** — altyapısı hazır; puanlama ve ML kuralları henüz
  belirlenmedi. Hard eligibility katmanını **atlayamaz**.
- **Component test altyapısı** — `jsdom` + `@testing-library/react` eklenirse
  §9.3'teki 11 madde otomatikleşir. Bağımlılık kararı olduğu için ertelendi.
- **Polling maliyeti** — çift başına tur başına 300–1000 istek. Realtime'a
  geçmek bunu ~0'a indirir. Denetimde ölçüldü, henüz ele alınmadı.

---

## 10. Temizlenmemiş bir şey var mı?

Hayır. Daha önce kök dizinde duran bozuk adlı artık dosya
(`erve reusable room implementation before remediation` + gizli karakter)
kaldırılmış durumda; `git status` temiz görünüyor (yalnız beklenen değişiklikler).

---

## 11. Hızlı komut özeti

```bash
npm run dev            # geliştirme sunucusu
npm test               # 294 test + 16 todo
npm run typecheck
npm run lint
npm run build
npm audit --omit=dev

git branch --show-current   # feature/reusable-room-candidates olmalı
git status --short
```

Doğrulama sırası her zaman: **test → typecheck → lint → build → audit**.
