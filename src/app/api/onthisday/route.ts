import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const now = new Date();
    // Wikipedia API expects MM and DD
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');

    // Fetch historically accurate data directly from Wikimedia
    const wikiRes = await fetch(`https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${mm}/${dd}`, {
        headers: {
            'User-Agent': 'EvoScout-Bot/1.0 (elijahryal@gmail.com)'
        }
    });

    if (!wikiRes.ok) {
        throw new Error(`Wikipedia API failed with status: ${wikiRes.status}`);
    }

    const data = await wikiRes.json();
    const allEvents = data.events || [];

    // Keywords to heavily prioritize Science/Biology/Tech history
    const keywords = [
        'science', 'biology', 'medicine', 'discovery', 'university', 'patent', 
        'technology', 'computer', 'space', 'hospital', 'disease', 'virus', 
        'dna', 'physics', 'chemistry', 'health', 'nature', 'astronomy', 'nobel',
        'research', 'laboratory', 'surgeon', 'vaccine', 'genetics'
    ];

    // Score events purely based on keyword matches
    const scoredEvents = allEvents.map((e: any) => {
        const text = (e.text || "").toLowerCase();
        let score = 0;
        keywords.forEach(k => {
            if (text.includes(k)) score += 1;
        });
        return { event: e, score };
    });

    // Sort by score descending (most relevant first)
    scoredEvents.sort((a: any, b: any) => b.score - a.score);

    // Pick top 5 events
    const picked = scoredEvents.slice(0, 5).map((e: any) => e.event);

    // Sort the final 5 chronologically for the UI
    picked.sort((a: any, b: any) => Number(a.year) - Number(b.year));

    const finalEvents = picked.map((e: any, idx: number) => {
        const primaryPage = e.pages && e.pages.length > 0 ? e.pages[0] : null;
        let pageUrl = null;
        
        if (primaryPage && primaryPage.content_urls && primaryPage.content_urls.desktop) {
            pageUrl = primaryPage.content_urls.desktop.page;
        }

        return {
            id: `WIKI-${e.year}-${idx}`,
            year: e.year,
            text: e.text,
            pageUrl: pageUrl
        };
    });

    return NextResponse.json({ success: true, events: finalEvents });

  } catch (error: any) {
    console.error("fetchOnThisDay pipeline error:", error);
    // Generic fallback if Wikipedia is unreachable
    return NextResponse.json({ 
        success: true, 
        events: [
            {
                id: "FALLBACK",
                year: new Date().getFullYear(),
                text: "EvoScout database synchronization in progress. Historical contextual data is currently unavailable.",
                pageUrl: null
            }
        ] 
    });
  }
}
