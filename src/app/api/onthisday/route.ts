import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const topicsMap = body.topics || {};

    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');

    // Default science keywords (curated for science milestones)
    const defaultScienceKeywords = "CRISPR|Cas9|Cas12|gene|cell|RNA|proteomics|synthetic biology|epigenetic|microbiome|cancer|pathology|zoology|biology|genetics|molecule|protein|enzyme|chromosome|evolution|physics|chemistry|astronomy|nobel|scientist|laboratory|university|institute";

    // Use user settings topics if they exist, otherwise fallback to defaults
    const combinedTerms = topicsMap.news
      ? topicsMap.news.split(',').map((s: string) => s.trim()).filter(Boolean).join('|') + "|" + defaultScienceKeywords
      : defaultScienceKeywords;

    const keywordRegex = new RegExp(combinedTerms, 'i');

    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${mm}/${dd}`,
      {
        headers: {
          'Api-User-Agent': 'EvoScout/1.0 (https://github.com/Nonsensical1/evoscout; elijahryal@outlook.com)',
          'Accept': 'application/json',
        },
        next: { revalidate: 3600 },
      }
    );

    if (!res.ok) {
      throw new Error("Wikipedia API responded with status: " + res.status);
    }

    const data = await res.json();
    const events: any[] = data.events || [];

    const filtered = events.filter((e: any) => {
      // Check the primary text and the extract of the first page link for science relevance
      const text = (e.text || '') + ' ' + (e.pages?.[0]?.extract || '');
      return keywordRegex.test(text);
    });

    // Sort by year ascending so older milestones appearing at top represents "history"
    filtered.sort((a: any, b: any) => (a.year || 0) - (b.year || 0));

    const finalEvents = filtered.slice(0, 8).map((e: any) => {
      const mainPage = e.pages && e.pages.length > 0 ? e.pages[0] : null;
      return {
        id: `HIST-${e.year}-${Math.random().toString(36).substr(2, 5)}`,
        year: e.year,
        text: e.text,
        pageTitle: mainPage?.title?.replace(/_/g, ' ') || null,
        pageUrl: mainPage?.content_urls?.desktop?.page || null,
        extract: mainPage?.extract || null,
        thumbnail: mainPage?.thumbnail?.source || null
      };
    });

    return NextResponse.json({ success: true, events: finalEvents });
  } catch (error: any) {
    console.error("fetchOnThisDay pipeline error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
