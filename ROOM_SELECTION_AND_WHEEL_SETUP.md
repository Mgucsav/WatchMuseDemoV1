# Oda Seçimi, Yeniden Kullanılabilir Turlar ve Ortak Çark

Bu belge, iki kişinin aynı odada gizli film seçimi yapıp ortak çark sonucunu
görmesi için gereken son kurulumu anlatır.

> ⚠️ **Bu sürümde yeni bir gizli değer gerekiyor.** Yeni tur açan veritabanı
> fonksiyonu artık `authenticated` rolüne kapalıdır; yalnızca `service_role`
> çağırabilir. Bu yüzden sunucu ortamına `SUPABASE_SERVICE_ROLE_KEY` eklemen
> gerekir (adım 1). Değeri yalnızca sunucuda tutulur; tarayıcıya gitmez ve
> `NEXT_PUBLIC_` önekiyle **asla** tanımlanmaz.

## Ne eklendi?

- Odaya katılan iki kullanıcıya, **aynı sırada aynı 10 film** gider.
- Her film için üç karar vardır: **İstemiyorum**, **Belki**, **İzlemek isterim**.
  Kartı sola kaydırmak “İstemiyorum”, sağa kaydırmak “İzlemek isterim”dir.
- Kişilerin tek tek kararları birbirine görünmez.
- İki kişi de 10 filmi bitirince yalnızca ikisinin de “İzlemek isterim” dediği
  filmler görünür.
- Çarkın kazananını tarayıcı değil, veritabanı seçer. Başlama zamanı ve kazanan
  kaydedildiği için iki cihaz aynı sonuca döner.
- Sonuç veya ortak eşleşme çıkmayan turdan sonra aynı oda ve davet korunarak yeni
  10 filmle devam edilir; eski adaylar ve oylar silinmez.
- İki tarafın da istemesine rağmen çarkta seçilmeyen film, 14 gün içinde ilk
  uygun sonraki turda bir kez öncelikli döner.
- İki tarafın da istemediği film 30 gün aynı odada bastırılır.
- Çark sonucu 7 gün boyunca kişi başına “İzleme listeme ekle” aksiyonu sunar.
- Yeni turdaki filmlerin **en az biri**, o odada daha önce hiç gösterilmemiş
  gerçek bir keşif olmak zorundadır. “Daha önce gösterilmiş” yalnızca bir önceki
  turu değil, **odanın bütün geçmişini** kapsar.
- Uygun film bulunamazsa oda, kuralları gevşetip uygun olmayan film göstermek
  yerine **dürüstçe hata verir**.
- Sonuç ekranında kalan taraf, partneri yeni tur açtığında bunu sayfayı elle
  yenilemeden görür (30 saniyede bir düşük frekanslı kontrol).

## 1. Service role anahtarını sunucu ortamına ekle

Supabase Dashboard → **Project Settings → API** → `service_role` (secret).

Yerelde `.env.local` dosyasına şu **adla** ekle (değeri buraya ya da başka bir
belgeye yazma):

```text
SUPABASE_SERVICE_ROLE_KEY=<Supabase panelindeki service_role değeri>
```

Vercel'de: **Settings → Environment Variables** → aynı ad, `Production` ve
`Preview` ortamları. `NEXT_PUBLIC_` önekli bir karşılığını **oluşturma**; o önek
değeri tarayıcıya gönderir ve Row Level Security'yi tamamen atlar.

Bu değişken tanımlı değilse yeni tur açılamaz ve uygulama `not_configured`
hatası döndürür — sessizce daha zayıf bir yola düşmez.

## 2. Supabase migration sırası

İlk oda turu migration'ı daha önce uygulandıysa şimdi şu **iki yeni dosya**
sırayla çalıştırılır:

`supabase/migrations/20260813000100_reusable_rounds.sql`
`supabase/migrations/20260814000100_room_subscriptions.sql`

Tam sıralama:

```text
20260811000100_rooms_schema.sql
20260811000200_rooms_rls.sql
20260811000300_rooms_functions.sql
20260812000100_profiles_and_library.sql
20260812000200_room_rounds_votes_and_wheel.sql
20260813000100_reusable_rounds.sql
20260814000100_room_subscriptions.sql
```

`20260812000300_preference_signals.sql` bu production tasarımının parçası
değildir ve uygulanmamalıdır.

1. Supabase Dashboard'da WatchMuse projenin **SQL Editor** sayfasını aç.
2. **New query** seç.
3. VS Code'da yukarıdaki dosyayı tamamen aç, içeriğin tamamını kopyala.
4. SQL Editor'a yapıştır.
5. Sağ alttan/üstten **Run** seç.
6. Uyarı gelirse SQL'i tekrar incele ve çalıştır. Yeni selection tablolarında
   RLS migration içinde etkinleştirilir; doğrudan istemci politikası bilinçli
   olarak yoktur.

Başarılı sonuç: `Success. No rows returned`.

> Dosyayı tekrar çalıştırma ihtiyacı olursa önce söyle; migration bir kez
> uygulanacak şekilde tasarlandı. Yeni bir değişiklik gerekirse yeni migration
> dosyası eklenir, eskisi değiştirilmez.

### ⚠️ Kısa bakım penceresi gerekir

Bu migration eski `create_or_reset_space_round` fonksiyonunu `authenticated`
rolüne kapatır ve gövdesini `round_creation_moved` hatası verecek şekilde
değiştirir. Dolayısıyla **migration uygulandığı andan yeni uygulama sürümü
yayına alınana kadar yeni tur açılamaz.**

Bu pencerede devam eden turlarda oylama, çark ve kabul **çalışmaya devam eder**;
yalnızca yeni tur açma kapalıdır.

Uygulama sırası tam olarak şudur:

| # | Adım | Bu adımdan sonraki durum |
| --- | --- | --- |
| 1 | `SUPABASE_SERVICE_ROLE_KEY` sunucu ortamına eklenir | Değişiklik yok |
| 2 | Bakım penceresi başlatılır / duyurulur | Değişiklik yok |
| 3 | `20260813000100_reusable_rounds.sql` uygulanır | **Yeni tur açma kapalı** |
| 4 | `20260814000100_room_subscriptions.sql` uygulanır | **Oda açma ve odaya katılma da kapalı** |
| 5 | Yeni uygulama sürümü deploy edilir | Hepsi yeniden açık |
| 6 | Doğrulama (aşağıdaki sorgular + bir gerçek tur) | — |
| 7 | Pencere kapatılır | Normal |

### ⚠️ İkinci bakım penceresi etkisi: abonelik beyanı

`20260814000100_room_subscriptions.sql`, `create_space` ve
`join_space_with_invitation` fonksiyonlarına **abonelik listesi** parametresi
ekler. Eski tek argümanlı imzalar kaldırılmaz ama artık
`subscriptions_required` hatası verir. Yani bu migration ile yeni deploy
arasında **yeni oda açılamaz ve davet tüketilemez**; mevcut odalarda oylama,
çark ve kabul çalışmaya devam eder.

Migration'dan ÖNCE oluşmuş katılımcıların beyanı boştur. Bu odalarda yeni tur
açılamaz; oda ekranındaki **“Aboneliklerimi güncelle”** ile iki tarafın da
seçim yapması gerekir (kesişim boş olduğu sürece öneri üretilmez).

Sıra ters çevrilirse (önce deploy, sonra migration) yeni uygulama yeni imzayı
bulamaz ve yine tur açılamaz. Bu yüzden **migration önce** uygulanır ve pencere
mümkün olduğunca kısa tutulur.

## 3. Hızlı doğrulama

SQL Editor'da aşağıdakini çalıştır:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'space_rounds', 'room_candidates', 'room_votes',
    'room_selections', 'room_selection_acceptances'
  )
order by tablename;
```

Beş satır beklenir ve hepsinin `rowsecurity` değeri `true` olmalıdır.

Ek doğrulama:

```sql
select space_id, count(*)
from public.space_rounds
where status in ('voting', 'matching', 'spinning')
group by space_id
having count(*) > 1;
```

Sonuç 0 satır olmalıdır.

Güven sınırının gerçekten uygulandığını doğrula:

```sql
select
  has_function_privilege(
    'authenticated',
    'public.start_next_space_round(uuid, uuid, jsonb, text, text, text, boolean)',
    'execute') as authenticated_can_execute,
  has_function_privilege(
    'service_role',
    'public.start_next_space_round(uuid, uuid, jsonb, text, text, text, boolean)',
    'execute') as service_role_can_execute,
  has_function_privilege(
    'authenticated',
    'public.create_or_reset_space_round(uuid, jsonb, boolean)',
    'execute') as legacy_authenticated_can_execute;
```

Beklenen: `false`, `true`, `false`. `authenticated_can_execute` `true` dönerse
migration'ın grant bölümü uygulanmamıştır ve **devam etme**.

Aday nedenlerinin gerçekten yazıldığını doğrula (yeni bir tur açıldıktan sonra):

```sql
select selection_reason, count(*)
from public.room_candidates c
join public.space_rounds r on r.id = c.round_id
where r.space_id = '<oda-id>'
group by selection_reason;
```

Beklenen: yalnızca `priority_return`, `fresh_discovery`, `eligible_repeat`
değerleri; `null` olmamalı ve `fresh_discovery` sayısı **en az 1** olmalıdır.

## 4. Yerelde iki kişi testi

1. Proje klasöründe, açık terminale şunu yaz:

   ```powershell
   npm.cmd run dev -- --hostname 127.0.0.1 --port 3000
   ```

2. Normal pencerede `http://localhost:3000/rooms` sayfasından oda oluştur.
3. Davet bağlantısını Chrome gizli pencereye yapıştır.
4. İki ekranda da oda `2 / 2` olunca film turu otomatik açılır.
5. İki pencerede ilk filmin ve ilerleyen adayların aynı sırada geldiğini kontrol et.
6. Her iki tarafta da 10 filmi değerlendir. Testi hızlandırmak için en az iki aynı
   filme iki tarafta da **İsterim** de.
7. İki taraf bitince ortak film kartları iki ekranda görünür.
8. Bir pencereden **Ortak çarkı çevir** seç. En geç yaklaşık 1–2 saniye içinde
   diğer ekranda da aynı çark dönmeye başlar; sonuç iki tarafta aynı olmalıdır.
9. Sonuçtan sonra iki ekranda seçilen filmi ve yedi günlük süreyi gör.
10. Yalnızca bir pencerede **İzleme listeme ekle** seç. O kullanıcıda
    “İzleme listene eklendi” görünmeli; partnerin kütüphanesi değişmemelidir.
11. **Yeni 10 filmle devam et** seç. Tur numarası ilerlemeli; önceki tur
    satırları, adayları ve oyları veritabanında kalmalıdır.
12. Aynı anda iki pencereden yeni tur başlatmayı dene. Tek aktif tur ve iki
    ekranda aynı 10 aday görülmelidir.
13. **Sonuç ekranında bekleyen taraf:** bir pencere sonuç ekranında kalsın,
    diğerinden yeni tur aç. İlk pencere en geç ~30 saniye içinde yeni tura
    kendiliğinden geçmelidir — elle yenileme gerekmemelidir.
14. **Geçmiş sınırı:** birkaç tur çevirdikten sonra ikinci turda gördüğün bir
    filmin dördüncü turda tekrar çıkmadığını kontrol et. Bir önceki tur değil,
    **bütün geçmiş** dışlanır.
15. **Dürüst başarısızlık:** yeni tur açılamadığında ekranda hata görünmeli ve
    mevcut ekran (oylar / bekleyen seçim) kaybolmamalıdır.

Zaman pencereleri için hızlı manuel test, production verisini değiştirmeden ayrı
bir test projesinde yapılmalıdır: both-skip karar zamanını 29/30/31 gün;
priority kazanımını 13/14/15 gün; kabul deadline'ını önce/sonra olacak biçimde
kurup yeni tur isteğinde beklenen uygunluğu kontrol et.

## 5. Otomatik veritabanı testleri — ÇALIŞTIRILMADI

Yukarıdaki zaman pencereleri, kısıtlar, grant'ler ve yarış davranışları için
gerçek PostgreSQL üzerinde çalışan bir test paketi `supabase/tests/` altında
**depoda hazırdır**, ancak bu makinede **çalıştırılmamıştır**: `docker`, `psql`,
`supabase` CLI ve yerel PostgreSQL kurulu değildir.

Çalıştırmak için (yalnızca **atılabilir** bir test veritabanında):

```bash
export WATCHMUSE_TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:55432/postgres"
bash supabase/tests/run-integration-tests.sh
```

Windows:

```powershell
$env:WATCHMUSE_TEST_DATABASE_URL = "postgresql://postgres:postgres@localhost:55432/postgres"
powershell -ExecutionPolicy Bypass -File supabase	ests
un-integration-tests.ps1
```

Koşucu, adres `supabase.co` içeriyorsa çalışmayı **reddeder**; testler şema
düşürür ve production veritabanına asla bağlanmamalıdır.

Ayrıntı ve kapsam tablosu: `supabase/tests/README.md`.

> Bu paket geçene kadar RLS'in, service-role sınırının, kısıtların ve
> eşzamanlılık yarışlarının doğru çalıştığı **doğrulanmış sayılmaz**.
> `npm test` çıktısındaki 16 `todo` girdisi bu durumu görünür kılar.

## Sorun olursa

| Belirti | İlk kontrol |
| --- | --- |
| “Seçim turu açılamadı” | Yeni migration'ın başarıyla çalıştığını kontrol et; terminaldeki `next dev` sürecini yeniden başlat. |
| Oda iki kişiyken “hazırlanıyor” kalıyor | Oda sahibinin penceresini yenile; Supabase'de Anonymous sign-ins açık olmalı. |
| İki pencereye farklı film listesi geliyor | Bu beklenen bir durum değildir; oda ID'si aynı mı kontrol et ve sonucu bildir. |
| Çark sadece bir ekranda dönüyor | Diğer pencereyi yenile; sunucuda kaydedilmiş zaman damgası sayesinde sonuç yine aynı kalır. |
| Ortak film çıkmıyor | Bu hata değildir; ikiniz de aynı en az bir filme “İsterim” demelisiniz. |
| Yeni tur açılamıyor | Yeni `20260813000100` migration'ının uygulandığını ve deployment'ın migration sonrası yapıldığını kontrol et. |
| “Sunucu yapılandırması eksik” / `not_configured` | `SUPABASE_SERVICE_ROLE_KEY` sunucu ortamında tanımlı mı? Vercel'de ilgili ortama eklendikten sonra yeniden deploy gerekir. |
| `round_creation_moved` hatası | Migration uygulandı ama uygulama eski sürümde. Yeni sürümü deploy et. |
| “Uygun film bulunamadı” | Beklenen bir durumdur: odada 30/14/7 günlük kurallar yeterli uygun film bırakmamıştır. Kurallar gevşetilmez; birkaç gün beklemek gerekir. |

## Rollback notu

Eski `create_or_reset_space_round` imzası **uyumluluk yolu olarak korunmaz**.
`authenticated` rolünden EXECUTE geri alınmıştır ve gövdesi aday planı kabul
etmez, kaydetmez; `round_creation_moved` hatası fırlatır. Bunun sebebi, kalıcı
bir authenticated aday-üretim kapısının güven sınırını delmesidir: o kapı açık
kalsaydı bir oda üyesi kendi aday listesini dayatabilirdi.

Pratik sonuç: **eski uygulama sürümüne dönmek yeni tur açma yeteneğini geri
getirmez.** Eski arayüz yeni tur ve selection özelliklerini de göstermez.

Sorun çıkarsa:

1. Yeni tur açmayı durdur (kullanıcıya duyur).
2. Devam eden turlar, oylar, çark ve kabuller etkilenmez — bunlar çalışmaya
   devam eder.
3. Veriyi yedekle.
4. **Forward-fix uygula.** Uygulanmış migration dosyasını düzenleme; gerekiyorsa
   yeni bir migration ekle.
5. Geçmişi silen eski RPC gövdesini geri getirme — o gövde `space_rounds`
   satırını `DELETE` ediyordu ve cascade ile tüm adayları ve oyları siliyordu.

## Canlıya gönderirken

Kod GitHub'a push edilip Vercel otomatik deploy olduğunda bu özellik de gider.
Vercel'de artık **beş** değişken gerekir:

```text
TMDB_ACCESS_TOKEN            ← gizli · yalnız sunucu
SUPABASE_SERVICE_ROLE_KEY    ← gizli · yalnız sunucu · BU SÜRÜMDE YENİ
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SITE_URL
```

`TMDB_ACCESS_TOKEN` ve `SUPABASE_SERVICE_ROLE_KEY` yalnızca Vercel sunucusunda
okunur; tarayıcıya, GitHub'a veya davet bağlantısına eklenmez. İkisinin de
`NEXT_PUBLIC_` önekli bir karşılığı yoktur ve olmamalıdır.

Deploy sırası için yukarıdaki bakım penceresi tablosunu izle: **önce migration,
sonra deploy.**
