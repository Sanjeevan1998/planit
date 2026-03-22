import { NextRequest, NextResponse } from 'next/server';

// Add UNSPLASH_ACCESS_KEY to .env.local — free at unsplash.com/developers
// Without it we fall back to loremflickr.com (free, keyword-based, reliable).
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('q') ?? '';
  if (!raw) return NextResponse.json({ url: null });

  // Strip full addresses — keep only the landmark/place name
  const clean = raw
    .split(/[,\d]/)[0]
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 4)
    .join(' ');

  const q = clean || raw.split(' ').slice(0, 3).join(' ');

  const key = process.env.UNSPLASH_ACCESS_KEY;

  if (key) {
    try {
      const res = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=1&orientation=landscape`,
        {
          headers: { Authorization: `Client-ID ${key}` },
          next: { revalidate: 86400 },
        },
      );
      if (res.ok) {
        const data = await res.json();
        const url: string | null = data.results?.[0]?.urls?.regular ?? null;
        if (url) return NextResponse.json({ url });
      }
    } catch {
      // fall through
    }
  }

  // Reliable fallback: loremflickr uses Flickr keyword search + deterministic lock
  const lock = Math.abs(q.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)) % 100;
  const keywords = q.replace(/\s+/g, ',');
  const fallback = `https://loremflickr.com/800/500/${encodeURIComponent(keywords)},travel?lock=${lock}`;
  return NextResponse.json({ url: fallback });
}
