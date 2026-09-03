export interface SocialMovie {
  id: number;
  title: string;
  posterPath: string | null;
  posterUrl: string | null;
}

export interface SocialPost {
  id: string;
  authorDisplayName: string;
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

export interface SocialFeedResponse {
  posts: SocialPost[];
}

export interface SocialToggleResponse {
  active: boolean;
}
