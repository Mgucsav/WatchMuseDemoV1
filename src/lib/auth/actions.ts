"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { getCurrentActor } from "@/lib/auth/dal";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AuthFormState } from "./form-state";
import { safeRedirectPath } from "./redirects";
import { normalizeEmail, validateCredentials } from "./validation";

/**
 * Kimlik doğrulama Server Action'ları.
 *
 * Server Action'lar daima sunucuda çalışır: şifre tarayıcı paketine girmez ve
 * çerez yazma işlemi burada yapılabilir (Server Component'te yapılamaz).
 *
 * Hata mesajları GENELDİR. Özellikle giriş hatasında "bu e-posta kayıtlı değil"
 * gibi bir ayrım YAPILMAZ — bu, hesap sayımı (user enumeration) sağlar.
 */

const NOT_CONFIGURED: AuthFormState = {
  error:
    "Hesap servisi henüz yapılandırılmamış. Sunucuda Supabase ayarları eksik.",
  notice: null,
};

/** E-posta bağlantılarının döneceği mutlak adres. */
async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1")
    ? "http"
    : "https";

  return `${protocol}://${host}`;
}

export async function signUpAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;

  // Normal kullanımda tüm ziyaretçiler önce anonim kimlikle başlar. Bu durumda
  // `signUp()` yeni bir user_id üretirdi; onun yerine /hesabini-kaydet akışı
  // mevcut kimliği e-postaya bağlar ve kayıtları yerinde bırakır.
  const actor = await getCurrentActor();
  if (actor?.isAnonymous) {
    return {
      error:
        "Bu cihazda geçici listeniz var. Kayıtlarınızı korumak için “Puanlarını kaydet” akışını kullanın.",
      notice: null,
    };
  }

  const validated = validateCredentials({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
  });

  if (!validated.ok) return { error: validated.error, notice: null };

  const supabase = await createSupabaseServerClient().catch(() => null);
  if (!supabase) return NOT_CONFIGURED;

  const nextPath = safeRedirectPath(formData.get("next"));
  const origin = await siteOrigin();

  const { data, error } = await supabase.auth.signUp({
    email: validated.value.email,
    password: validated.value.password,
    options: {
      // Profil trigger'ı bu alanı okur.
      data: validated.value.displayName
        ? { display_name: validated.value.displayName }
        : undefined,
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
    },
  });

  if (error) {
    return {
      error: "Kayıt tamamlanamadı. Bilgileri kontrol edip tekrar deneyin.",
      notice: null,
    };
  }

  // E-posta doğrulaması açıksa oturum gelmez; kullanıcı postayı beklemelidir.
  if (!data.session) {
    return {
      error: null,
      notice:
        "Hesabınız oluşturuldu. E-posta adresinize gönderilen doğrulama bağlantısına tıklayın.",
    };
  }

  redirect(nextPath);
}

/**
 * Anonim ziyaretçinin mevcut Supabase kimliğine bir e-posta bağlar.
 *
 * Bu `signUp()` değildir: `auth.uid()` değişmediği için library_items ve oda
 * sahipliği taşınmaz, olduğu yerde kalır. Supabase tarafında Manual Linking
 * açık olmalıdır; kurulum belgesinde bu özellikle belirtilir.
 */
export async function startAccountSaveAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;

  const actor = await getCurrentActor();
  if (!actor?.isAnonymous) {
    return {
      error: "Bu işlem yalnızca geçici ziyaretçi hesabı için gerekli.",
      notice: null,
    };
  }

  const email = normalizeEmail(formData.get("email"));
  if (!email) {
    return { error: "Geçerli bir e-posta adresi girin.", notice: null };
  }

  const supabase = await createSupabaseServerClient().catch(() => null);
  if (!supabase) return NOT_CONFIGURED;

  const nextPath = safeRedirectPath(formData.get("next"));
  const finishPath = `/hesabini-kaydet?adim=sifre&next=${encodeURIComponent(nextPath)}`;
  const origin = await siteOrigin();

  const { error } = await supabase.auth.updateUser(
    { email },
    {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(finishPath)}`,
    },
  );

  if (error) {
    // E-posta başka bir hesaba ait olsa bile ayrıntı vererek hesap sayımı yapma.
    return {
      error:
        "E-posta bağlantısı başlatılamadı. Adresi kontrol edin veya mevcut hesabınızla giriş yapın.",
      notice: null,
    };
  }

  return {
    error: null,
    notice:
      "Doğrulama bağlantısını e-posta adresinize gönderdik. Bu cihazdaki bağlantıyı açın; ardından şifrenizi belirleyeceksiniz.",
  };
}

/** E-posta doğrulanınca anonim kimliğe şifre ekleyerek hesabı tamamlar. */
export async function finishAccountSaveAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;

  const actor = await getCurrentActor();
  if (!actor || actor.isAnonymous || !actor.emailConfirmed) {
    return {
      error:
        "Önce e-postanıza gelen doğrulama bağlantısını bu cihazda açın.",
      notice: null,
    };
  }

  const validated = validateCredentials({
    email: actor.email ?? "placeholder@example.com",
    password: formData.get("password"),
  });
  if (!validated.ok) return { error: validated.error, notice: null };

  const supabase = await createSupabaseServerClient().catch(() => null);
  if (!supabase) return NOT_CONFIGURED;

  const { error } = await supabase.auth.updateUser({
    password: validated.value.password,
  });

  if (error) {
    return { error: "Şifre belirlenemedi. Lütfen tekrar deneyin.", notice: null };
  }

  redirect(safeRedirectPath(formData.get("next")));
}

export async function signInAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;

  const validated = validateCredentials({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validated.ok) {
    // Giriş ekranında doğrulama hatası da genel tutulur.
    return { error: "E-posta veya şifre hatalı.", notice: null };
  }

  const supabase = await createSupabaseServerClient().catch(() => null);
  if (!supabase) return NOT_CONFIGURED;

  const { error } = await supabase.auth.signInWithPassword({
    email: validated.value.email,
    password: validated.value.password,
  });

  if (error) {
    // Hesabın var olup olmadığını ele vermeyen tek bir mesaj.
    return { error: "E-posta veya şifre hatalı.", notice: null };
  }

  redirect(safeRedirectPath(formData.get("next")));
}

export async function signOutAction(): Promise<void> {
  if (!isSupabaseConfigured()) redirect("/");

  const supabase = await createSupabaseServerClient().catch(() => null);
  if (supabase) {
    await supabase.auth.signOut();
  }

  redirect("/");
}

export async function requestPasswordResetAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;

  const email = formData.get("email");
  const supabase = await createSupabaseServerClient().catch(() => null);
  if (!supabase) return NOT_CONFIGURED;

  if (typeof email === "string" && email.trim() !== "") {
    const origin = await siteOrigin();
    // Sonuç bilinçli olarak yok sayılır: hata da başarı da aynı mesajı verir.
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/sifre-sifirla")}`,
    });
  }

  // Hesap sayımını engellemek için daima aynı yanıt.
  return {
    error: null,
    notice:
      "Bu adres kayıtlıysa şifre sıfırlama bağlantısı gönderildi. Gelen kutunuzu kontrol edin.",
  };
}

export async function updatePasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;

  const password = formData.get("password");
  const validated = validateCredentials({
    email: "placeholder@example.com", // bu akışta e-posta sorulmaz
    password,
  });

  if (!validated.ok) return { error: validated.error, notice: null };

  const supabase = await createSupabaseServerClient().catch(() => null);
  if (!supabase) return NOT_CONFIGURED;

  // Şifre sıfırlama bağlantısı geçerli bir oturum kurar; olmadan güncellenemez.
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return {
      error:
        "Şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş. Yeniden bağlantı isteyin.",
      notice: null,
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: validated.value.password,
  });

  if (error) {
    return { error: "Şifre güncellenemedi. Lütfen tekrar deneyin.", notice: null };
  }

  redirect("/kutuphanem");
}
