# Oda Seçimi ve Ortak Çark — Kurulum ve Test

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
- Ortak film çıkmazsa “Yeni 10 film getir” ile temiz bir tur açılır.

## 1. Yeni Supabase migration'ını uygula

Bu projede önceki dört migration zaten uygulandı. Şimdi yalnızca şu **tek yeni
dosyayı** çalıştıracaksın:

`supabase/migrations/20260812000200_room_rounds_votes_and_wheel.sql`

1. Supabase Dashboard'da WatchMuse projenin **SQL Editor** sayfasını aç.
2. **New query** seç.
3. VS Code'da yukarıdaki dosyayı tamamen aç, içeriğin tamamını kopyala.
4. SQL Editor'a yapıştır.
5. Sağ alttan/üstten **Run** seç.
6. Uyarı gelirse **Run and enable RLS** seç. Dosya RLS'i, politikaları ve güvenli
   sunucu fonksiyonlarını birlikte kurar. **Run without RLS** seçeneğini kullanma.

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
  and tablename in ('space_rounds', 'room_candidates', 'room_votes')
order by tablename;
```

Üç satır beklenir ve üçünün de `rowsecurity` değeri `true` olmalıdır.

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

## Sorun olursa

| Belirti | İlk kontrol |
| --- | --- |
| “Seçim turu açılamadı” | Yeni migration'ın başarıyla çalıştığını kontrol et; terminaldeki `next dev` sürecini yeniden başlat. |
| Oda iki kişiyken “hazırlanıyor” kalıyor | Oda sahibinin penceresini yenile; Supabase'de Anonymous sign-ins açık olmalı. |
| İki pencereye farklı film listesi geliyor | Bu beklenen bir durum değildir; oda ID'si aynı mı kontrol et ve sonucu bildir. |
| Çark sadece bir ekranda dönüyor | Diğer pencereyi yenile; sunucuda kaydedilmiş zaman damgası sayesinde sonuç yine aynı kalır. |
| Ortak film çıkmıyor | Bu hata değildir; ikiniz de aynı en az bir filme “İsterim” demelisiniz. |

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
