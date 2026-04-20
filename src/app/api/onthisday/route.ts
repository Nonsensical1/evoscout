import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
// Allow Vercel Pro functions up to 300 s — ~104 years × ~900 ms/request ≈ 94 s
export const maxDuration = 300;

// NYT Developer API key — add NYT_API_KEY to Vercel env vars to override
const NYT_API_KEY = process.env.NYT_API_KEY || 'Zg3680b2RjPZAhZMb4LX0b8QYc4iF8XcXwGG5Dg3exNRiTJT';

const FALLBACK_EVENTS = [
  {
    id: 'HIST-1953-XYZ',
    year: 1953,
    text: 'Watson and Crick publish the double helix structure of DNA, revolutionizing molecular biology and ushering in the modern age of genetics.',
    pageUrl: 'https://en.wikipedia.org/wiki/DNA',
  },
  {
    id: 'HIST-1983-XYZ',
    year: 1983,
    text: 'Kary Mullis conceives the polymerase chain reaction (PCR), enabling rapid amplification of DNA sequences and becoming a bedrock of modern molecular biology.',
    pageUrl: 'https://en.wikipedia.org/wiki/Polymerase_chain_reaction',
  },
  {
    id: 'HIST-2001-XYZ',
    year: 2001,
    text: 'The draft sequence of the human genome is simultaneously published in Nature and Science, unlocking the modern era of genomics and personalised medicine.',
    pageUrl: 'https://en.wikipedia.org/wiki/Human_Genome_Project',
  },
  {
    id: 'HIST-2012-XYZ',
    year: 2012,
    text: 'Jennifer Doudna and Emmanuelle Charpentier demonstrate that CRISPR-Cas9 can be programmed for precision gene editing in a landmark Science paper.',
    pageUrl: 'https://en.wikipedia.org/wiki/CRISPR',
  },
];

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const topicsMap = body.topics || {};

    // Build a concise OR-joined query from user's news topics, or fall back to defaults
    const defaultQuery =
      'biology OR genetics OR CRISPR OR cancer OR genomics OR proteomics OR science';
    const scienceQuery = topicsMap.news
      ? topicsMap.news
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean)
          .slice(0, 5)
          .join(' OR ')
      : defaultQuery;

    // Target: this calendar month+day across every year from 1980 to last year
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const monthDay = `${mm}${dd}`;
    const currentYear = today.getFullYear();

    // Start from 1921 — modern biology coverage begins reliably in this era
    let allYears: number[] = [];
    for (let y = 1921; y < currentYear; y++) allYears.push(y);
    
    // Pick exactly 5 random years to avoid blowing through NYT 5 Req/Minute rate limit
    allYears = allYears.sort(() => 0.5 - Math.random()).slice(0, 5);

    console.log(
      `[OnThisDay] Full sweep: ${allYears.length} years (1921–${currentYear - 1}) for ${mm}/${dd}`
    );

    const events: any[] = [];

    // Query the 5 candidate years sequentially.
    for (let i = 0; i < allYears.length; i++) {
      const year = allYears[i];

      // Pause before every request except the very first
      if (i > 0) await sleep(700);

      // Search across the month to guarantee we actually find science articles, 
      // preventing the query from failing due to empty publishing days.
      const beginDateStr = `${year}${mm}01`;
      const endDateStr = `${year}${mm}28`;
      
      const params = new URLSearchParams({
        q: scienceQuery,
        'api-key': NYT_API_KEY,
        begin_date: beginDateStr,
        end_date: endDateStr,
        sort: 'relevance',
        fl: 'headline,abstract,pub_date,web_url',
      });
      const url = `https://api.nytimes.com/svc/search/v2/articlesearch.json?${params}`;

      let docs: any[] = [];
      try {
        let res = await fetch(url, { headers: { Accept: 'application/json' } });

        // If rate-limited, back off once
        if (res.status === 429) {
          console.warn(`[OnThisDay] 429 at year ${year} — backing off 12 s…`);
          await sleep(12000);
          res = await fetch(url, { headers: { Accept: 'application/json' } });
        }

        if (!res.ok) {
          console.warn(`[OnThisDay] HTTP ${res.status} for year ${year}, skipping.`);
          continue;
        }

        const data = await res.json();
        // Fallback correctly if docs is null
        docs = (data.response && data.response.docs) ? data.response.docs : [];
      } catch (fetchErr) {
        console.error(`[OnThisDay] Network error for year ${year}:`, fetchErr);
        continue;
      }

      // Pick the best article: must have a headline and a non-trivial abstract
      const best = docs.find(
        (d: any) => d.headline?.main && d.abstract && d.abstract.length > 30
      );
      if (!best) continue;

      const pubYear = new Date(best.pub_date).getFullYear();
      const headline = best.headline.main as string;
      const abstract = (best.abstract as string).replace(/\s+/g, ' ').trim();
      const text = abstract.length > 20 ? `${headline}. ${abstract}` : headline;

      events.push({
        id: `HIST-${pubYear}-${i}-${Math.random().toString(36).substr(2, 5)}`,
        year: pubYear,
        text: text.substring(0, 400),
        pageUrl: best.web_url || null,
      });
    }

    // Sort chronologically so the sidebar reads oldest → newest
    events.sort((a, b) => Number(a.year) - Number(b.year));
    console.log(`[OnThisDay] Sweep complete — ${events.length} events collected.`);

    const finalEvents = events.length >= 2 ? events : FALLBACK_EVENTS;
    return NextResponse.json({ success: true, events: finalEvents });
  } catch (error: any) {
    console.error('[OnThisDay] Pipeline error:', error);
    return NextResponse.json({ success: true, events: FALLBACK_EVENTS });
  }
}
