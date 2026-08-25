# Oda Seçimi, Yeniden Kullanılabilir Turlar ve Ortak Çark

Bu belge, iki kişinin aynı odada gizli film seçimi yapıp ortak çark sonucunu
görmesi için gereken son kurulumu anlatır. Mevcut `.env.local` değerlerin yeterli;
burada yeni bir API anahtarı veya gizli değer girmeyeceksin.

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

## 1. Supabase migration sırası

İlk oda turu migration'ı daha önce uygulandıysa şimdi yalnızca şu **tek yeni
dosya** çalıştırılır:

`supabase/migrations/20260813000100_reusable_rounds.sql`

Tam sıralama:

```text
20260811000100_rooms_schema.sql
20260811000200_rooms_rls.sql
20260811000300_rooms_functions.sql
20260812000100_profiles_and_library.sql
20260812000200_room_rounds_votes_and_wheel.sql
20260813000100_reusable_rounds.sql
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

## 2. Hızlı doğrulama

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

## 3. Yerelde iki kişi testi

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

Zaman pencereleri için hızlı manuel test, production verisini değiştirmeden ayrı
bir test projesinde yapılmalıdır: both-skip karar zamanını 29/30/31 gün;
priority kazanımını 13/14/15 gün; kabul deadline'ını önce/sonra olacak biçimde
kurup yeni tur isteğinde beklenen uygunluğu kontrol et.

## Sorun olursa

| Belirti | İlk kontrol |
| --- | --- |
| “Seçim turu açılamadı” | Yeni migration'ın başarıyla çalıştığını kontrol et; terminaldeki `next dev` sürecini yeniden başlat. |
| Oda iki kişiyken “hazırlanıyor” kalıyor | Oda sahibinin penceresini yenile; Supabase'de Anonymous sign-ins açık olmalı. |
| İki pencereye farklı film listesi geliyor | Bu beklenen bir durum değildir; oda ID'si aynı mı kontrol et ve sonucu bildir. |
| Çark sadece bir ekranda dönüyor | Diğer pencereyi yenile; sunucuda kaydedilmiş zaman damgası sayesinde sonuç yine aynı kalır. |
| Ortak film çıkmıyor | Bu hata değildir; ikiniz de aynı en az bir filme “İsterim” demelisiniz. |
| Yeni tur açılamıyor | Yeni `20260813000100` migration'ının uygulandığını ve deployment'ın migration sonrası yapıldığını kontrol et. |

## Rollback notu

Migration, eski RPC imzasını append-only compatibility wrapper olarak korur;
migration-first rollout mevcut no-match akışını silme riski olmadan sürdürür.
Yine de yeni çoklu turlar üretildikten sonra eski `ccce84b` arayüzü yeni tur ve
selection özelliklerini göstermez. Rollback gerekiyorsa yeni tur yazımını durdur,
veriyi yedekle ve mümkünse forward-fix uygula. Uygulanmış migration dosyasını
düzenleme veya eski silen RPC gövdesini geri getirme.

## Canlıya gönderirken

Kod GitHub'a push edilip Vercel otomatik deploy olduğunda bu özellik de gider.
Vercel'de mevcut dört değişkenin kalması yeterlidir:

```text
TMDB_ACCESS_TOKEN
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SITE_URL
```

`TMDB_ACCESS_TOKEN` yalnızca Vercel sunucusunda okunur; tarayıcıya, GitHub'a veya
davet bağlantısına eklenmez.
