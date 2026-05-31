import { gqlServerFetch } from '../../lib/graphql-server';

const SITE_URL = process.env['NEXT_PUBLIC_SITE_URL'] ?? 'http://localhost:3000';

interface Post {
  id: string;
  title: string;
  excerpt: string;
  imageUrl: string;
  category: string;
  publishedAt: string;
  author: string;
}

interface PostsData { featuredPosts: Post[] }

export async function GET() {
  let posts: Post[] = [];

  try {
    const data = await gqlServerFetch<PostsData>(
      `query RssPosts { featuredPosts(limit: 20) { id title excerpt imageUrl category publishedAt author } }`,
      undefined,
      3600,
    );
    posts = data.featuredPosts ?? [];
  } catch {
    // Return empty feed on error
  }

  const items = posts.map(post => `
    <item>
      <title><![CDATA[${post.title}]]></title>
      <link>${SITE_URL}/posts/${post.id}</link>
      <guid>${SITE_URL}/posts/${post.id}</guid>
      <description><![CDATA[${post.excerpt}]]></description>
      <author>${post.author}</author>
      <category>${post.category}</category>
      <pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>
      ${post.imageUrl ? `<enclosure url="${post.imageUrl}" type="image/jpeg" length="0" />` : ''}
    </item>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>TechStore Blog</title>
    <link>${SITE_URL}</link>
    <description>Latest tech articles and product news from TechStore</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />
    ${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 's-maxage=3600, stale-while-revalidate',
    },
  });
}
