import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const topicsMap = body.topics || {};

    const defaultScienceKeywords = "CRISPR, gene editing, proteomics, synthetic biology, microbiology, biology, cancer research, pathology, genomics";
    // topicsMap.news is safely truncated from page.tsx (1000 chars of actual titles)
    const combinedTerms = topicsMap.news || defaultScienceKeywords;

    const prompt = `You are a historical data assistant for an erudite synthetic biology and cellular news aggregation platform. 
Your task is to generate 4 to 6 significant historical scientific milestones that are DIRECTLY related to the subjects currently being parsed in today's news.

Today's news headlines/topics are:
"${combinedTerms}"

Find major discoveries, institutional foundings, pivotal publications, or paradigm shifts that happened historically in these EXACT specific subject areas. 
If possible, highlight events that happened in or around the current month, but prioritize absolute topical relevance above calendar dates. 

Output ONLY a raw JSON array of objects with no markdown formatting. Each object should have the following structure:
[
  {
    "year": 19XX, // integer year
    "text": "A 2-3 sentence engaging description of the historical milestone and its conceptual link to similar modern research.",
    "pageUrl": "https://en.wikipedia.org/wiki/..." // A relevant link for further reading
  }
]
No markdown code block wrappers. Return purely the array.`;

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
       throw new Error("Missing GEMINI_API_KEY environment variable.");
    }

    const gRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    if (!gRes.ok) {
       const errTx = await gRes.text();
       throw new Error(`Gemini API Error: ${gRes.status} - ${errTx}`);
    }

    const gData = await gRes.json();
    const rawText = gData.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    
    let events = [];
    try {
      events = JSON.parse(rawText);
    } catch (e) {
      const cleaned = rawText.replace(/```(?:json)?\s*/g, '').replace(/```\s*$/g, '').trim();
      events = JSON.parse(cleaned);
    }

    // Sort by chronological order
    events.sort((a: any, b: any) => Number(a.year) - Number(b.year));

    const finalEvents = events.map((e: any, idx: number) => ({
       id: `HIST-${e.year || 'UX'}-${idx}-${Math.random().toString(36).substr(2, 5)}`,
       year: e.year || "Unknown",
       text: e.text || "Historical record processed.",
       pageUrl: e.pageUrl || null
    }));

    return NextResponse.json({ success: true, events: finalEvents });
  } catch (error: any) {
    console.error("fetchOnThisDay pipeline error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
