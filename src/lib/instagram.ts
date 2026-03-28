/**
 * Meta Graph API wrapper for Instagram
 */

const GRAPH_URL = "https://graph.instagram.com";
const GRAPH_FB_URL = "https://graph.facebook.com/v21.0";

const APP_ID = process.env.INSTAGRAM_APP_ID || "";
const APP_SECRET = process.env.INSTAGRAM_APP_SECRET || "";
const REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI || "";

/** OAuth 인증 URL 생성 */
export function getAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: APP_ID,
    redirect_uri: REDIRECT_URI,
    scope: "instagram_basic,instagram_content_publish,instagram_manage_insights,pages_show_list,pages_read_engagement",
    response_type: "code",
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${params}`;
}

/** 코드 → short-lived token 교환 */
export async function exchangeCodeForToken(code: string): Promise<{
  accessToken: string;
  userId: string;
}> {
  const res = await fetch(`${GRAPH_FB_URL}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: APP_ID,
      client_secret: APP_SECRET,
      redirect_uri: REDIRECT_URI,
      code,
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return { accessToken: data.access_token, userId: data.user_id || "" };
}

/** Short-lived → Long-lived token (60일) */
export async function getLongLivedToken(shortToken: string): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: APP_ID,
    client_secret: APP_SECRET,
    fb_exchange_token: shortToken,
  });
  const res = await fetch(`${GRAPH_FB_URL}/oauth/access_token?${params}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return { accessToken: data.access_token, expiresIn: data.expires_in || 5184000 };
}

/** Long-lived token 갱신 */
export async function refreshLongLivedToken(token: string): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  const params = new URLSearchParams({
    grant_type: "ig_refresh_token",
    access_token: token,
  });
  const res = await fetch(`${GRAPH_URL}/refresh_access_token?${params}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return { accessToken: data.access_token, expiresIn: data.expires_in || 5184000 };
}

/** Facebook Page에 연결된 Instagram Business 계정 가져오기 */
export async function getInstagramAccount(accessToken: string): Promise<{
  igUserId: string;
  username: string;
  profilePicture: string;
} | null> {
  // 1. Get Facebook Pages
  const pagesRes = await fetch(`${GRAPH_FB_URL}/me/accounts?access_token=${accessToken}`);
  const pagesData = await pagesRes.json();
  if (!pagesData.data?.length) return null;

  // 2. Get Instagram Business Account from first page
  const pageId = pagesData.data[0].id;
  const igRes = await fetch(
    `${GRAPH_FB_URL}/${pageId}?fields=instagram_business_account&access_token=${accessToken}`
  );
  const igData = await igRes.json();
  const igUserId = igData.instagram_business_account?.id;
  if (!igUserId) return null;

  // 3. Get username and profile picture
  const profileRes = await fetch(
    `${GRAPH_FB_URL}/${igUserId}?fields=username,profile_picture_url&access_token=${accessToken}`
  );
  const profile = await profileRes.json();

  return {
    igUserId,
    username: profile.username || "",
    profilePicture: profile.profile_picture_url || "",
  };
}

/** 이미지 발행 (Single Image) */
export async function publishImage(
  igUserId: string,
  accessToken: string,
  imageUrl: string,
  caption: string
): Promise<{ mediaId: string; permalink: string }> {
  // 1. Create media container
  const containerRes = await fetch(`${GRAPH_FB_URL}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_url: imageUrl,
      caption,
      access_token: accessToken,
    }),
  });
  const container = await containerRes.json();
  if (container.error) throw new Error(container.error.message);

  // 2. Publish
  const publishRes = await fetch(`${GRAPH_FB_URL}/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      creation_id: container.id,
      access_token: accessToken,
    }),
  });
  const published = await publishRes.json();
  if (published.error) throw new Error(published.error.message);

  // 3. Get permalink
  const mediaRes = await fetch(
    `${GRAPH_FB_URL}/${published.id}?fields=permalink&access_token=${accessToken}`
  );
  const media = await mediaRes.json();

  return { mediaId: published.id, permalink: media.permalink || "" };
}

/** 계정 인사이트 */
export async function getAccountInsights(
  igUserId: string,
  accessToken: string
): Promise<{
  followers: number;
  reach: number;
  impressions: number;
}> {
  // Followers count
  const profileRes = await fetch(
    `${GRAPH_FB_URL}/${igUserId}?fields=followers_count&access_token=${accessToken}`
  );
  const profile = await profileRes.json();

  // Account insights (last 30 days)
  const insightsRes = await fetch(
    `${GRAPH_FB_URL}/${igUserId}/insights?metric=reach,impressions&period=day&since=${Math.floor(Date.now() / 1000) - 30 * 86400}&until=${Math.floor(Date.now() / 1000)}&access_token=${accessToken}`
  );
  const insights = await insightsRes.json();

  let reach = 0;
  let impressions = 0;
  if (insights.data) {
    for (const metric of insights.data) {
      const total = metric.values?.reduce((sum: number, v: { value: number }) => sum + v.value, 0) || 0;
      if (metric.name === "reach") reach = total;
      if (metric.name === "impressions") impressions = total;
    }
  }

  return {
    followers: profile.followers_count || 0,
    reach,
    impressions,
  };
}

/** 미디어 인사이트 */
export async function getMediaInsights(
  mediaId: string,
  accessToken: string
): Promise<{
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
}> {
  const res = await fetch(
    `${GRAPH_FB_URL}/${mediaId}/insights?metric=impressions,reach,likes,comments,saved,shares&access_token=${accessToken}`
  );
  const data = await res.json();

  const result = { impressions: 0, reach: 0, likes: 0, comments: 0, saves: 0, shares: 0 };
  if (data.data) {
    for (const metric of data.data) {
      const val = metric.values?.[0]?.value || 0;
      if (metric.name === "impressions") result.impressions = val;
      if (metric.name === "reach") result.reach = val;
      if (metric.name === "likes") result.likes = val;
      if (metric.name === "comments") result.comments = val;
      if (metric.name === "saved") result.saves = val;
      if (metric.name === "shares") result.shares = val;
    }
  }
  return result;
}
