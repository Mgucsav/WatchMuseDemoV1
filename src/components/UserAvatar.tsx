const SIZES = {
  sm: "h-9 w-9 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-24 w-24 text-2xl",
  xl: "h-24 w-24 text-2xl sm:h-32 sm:w-32 sm:text-3xl",
} as const;

/** Yuvarlak profil fotoğrafı; fotoğraf yoksa adın ilk iki harfi. */
export function UserAvatar({
  name,
  url,
  size = "md",
  className = "",
}: {
  name: string;
  url: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      className={`${SIZES[size]} inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-fill-placeholder font-bold ${className}`}
    >
      {url ? (
        // Public Supabase avatar URL'si kullanıcıya göre dinamik host taşır.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        name.slice(0, 2).toLocaleUpperCase("tr-TR")
      )}
    </span>
  );
}
