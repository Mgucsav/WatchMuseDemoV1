export interface SocialMovie {
  id: number;
  title: string;
  posterPath: string | null;
  posterUrl: string | null;
}

export interface SocialPost {
  id: string;
  /** Yazarın profil sayfası için; kullanıcı adı belirlememiş yazarlarda null. */
  authorUsername: string | null;
  authorDisplayName: string;
  authorAvatarUrl: string | null;
  body: string;
  movie: SocialMovie | null;
  createdAt: string;
  likeCount: number;
  replyCount: number;
  repostCount: number;
  likedByMe: boolean;
  repostedByMe: boolean;
  /** Çağıran bu gönderinin yazarıysa true; yazar kimliği dışarı çıkarılmaz. */
  isMine: boolean;
  latestReposterDisplayName: string | null;
}

/** Genel akış ya da yalnız takip edilenler. */
export type FeedScope = "all" | "following";
/** Hot: etkileşim + yenilik, top: son 30 günün en popülerleri, new: kronolojik. */
export type FeedSort = "hot" | "top" | "new";
export type ProfilePostKind = "posts" | "likes";
export type FollowListKind = "followers" | "following";

export interface SocialFeedResponse {
  posts: SocialPost[];
}

export interface SocialToggleResponse {
  active: boolean;
}

/** Herkese açık profil sayfası verisi; user_id içermez. */
export interface PublicProfile {
  username: string | null;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  createdAt: string;
  followerCount: number;
  followingCount: number;
  postCount: number;
  isMe: boolean;
  followedByMe: boolean;
  followsMe: boolean;
}

export interface FollowPerson {
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  followedByMe: boolean;
  isMe: boolean;
}

export interface FollowToggleResponse {
  following: boolean;
}
