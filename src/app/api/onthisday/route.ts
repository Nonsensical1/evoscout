import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const FALLBACK_EVENTS = [
  {
    id: "HIST-1953-XYZ",
    year: 1953,
    text: "James Watson and Francis Crick publish their paper describing the double helix structure of DNA, revolutionizing molecular biology and genetics.",
    pageUrl: "https://en.wikipedia.org/wiki/DNA"
  },
  {
    id: "HIST-1996-XYZ",
    year: 1996,
    text: "Dolly the sheep becomes the first mammal cloned from an adult somatic cell, a monumental milestone in genetics and synthetic bio-potential.",
    pageUrl: "https://en.wikipedia.org/wiki/Dolly_(sheep)"
  },
  {
    id: "HIST-2001-XYZ",
    year: 2001,
    text: "The initial sequencing of the human genome is published simultaneously in Nature and Science, unlocking the modern era of genomics.",
    pageUrl: "https://en.wikipedia.org/wiki/Human_Genome_Project"
  },
  {
    id: "HIST-2012-XYZ",
    year: 2012,
    text: "Jennifer Doudna and Emmanuelle Charpentier publish their landmark paper on CRISPR-Cas9, proving it could be programmed for precision gene editing.",
    pageUrl: "https://en.wikipedia.org/wiki/CRISPR"
  }
];

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const topicsMap = body.topics || {};

    const defaultScienceKeywords = "CRISPR, gene editing, proteomics, synthetic biology, microbiology, biology, cancer research, pathology, genomics";
    // topicsMap.news is safely truncated from page.tsx (1000 chars of actual titles)
    const combinedTerms = topicsMap.news || defaultScienceKeywords;

    const today = new Date();
    const month = today.toLocaleString('default', { month: 'long' });
    const day = today.getDate();

    const prompt = `You are a historical data assistant for an erudite synthetic biology and cellular news aggregation platform. 
Today is ${month} ${day}.
Your task is to generate 4 to 6 significant historical scientific milestones that are DIRECTLY related to the subjects currently being parsed in today's news.

Today's news headlines/topics are:
"${combinedTerms}"

CRITICAL RULES:
1. THEMATIC RELEVANCE: Find major discoveries, institutional foundings, pivotal publications, or paradigm shifts that happened historically in these EXACT specific subject areas.
2. AVOID REPETITION: Do NOT output the same famous milestones repeatedly (e.g., Dolly the Sheep, Watson & Crick DNA structure, initial CRISPR papers). Dig deep into niche, lesser-known, but highly impactful scientific progression.
3. CALENDAR PRIORITY: Prioritize events that happened in ${month}, or even better, exactly on ${month} ${day}. If none exist for these specific niche topics, you may select other dates, but state the month they occurred.
4. DIVERSITY: Ensure events span different decades or centuries (e.g., 1800s, 1900s, 2000s) to show the progression of the field.

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

    let finalEvents = [];
    let success = false;
    let attempts = 0;

    // Exponential Backoff API Wrapper (Prevents crashing if multiple users hit simultaneously)
    while (attempts < 3 && !success) {
      const gRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      if (gRes.ok) {
        const gData = await gRes.json();
        const rawText = gData.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
        
        try {
          let parsedEvents = [];
          try {
             parsedEvents = JSON.parse(rawText);
          } catch (e) {
             const cleaned = rawText.replace(/```(?:json)?\s*/g, '').replace(/```\s*$/g, '').trim();
             parsedEvents = JSON.parse(cleaned);
          }
          
          parsedEvents.sort((a: any, b: any) => Number(a.year) - Number(b.year));
          finalEvents = parsedEvents.map((e: any, idx: number) => ({
             id: `HIST-${e.year || 'UX'}-${idx}-${Math.random().toString(36).substr(2, 5)}`,
             year: e.year || "Unknown",
             text: e.text || "Historical record processed.",
             pageUrl: e.pageUrl || null
          }));
          success = true;
        } catch (e) {
          console.warn("JSON Parse Error from Gemini response", e);
        }
      } else if (gRes.status === 429) {
        console.log(`Rate limited (429). Attempt ${attempts + 1}/3. Waiting...`);
        // Exponential backoff: 2s, 4s, 8s
        await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempts)));
      } else {
        console.warn(`Gemini API Error: ${gRes.status}`);
        break; // Other status errors (400, 500) will abort the loop
      }
      attempts++;
    }

    // Fallback check
    if (!success || finalEvents.length === 0) {
       console.warn("Gemini generation ultimately failed. Providing generic curated pipeline events.");
       finalEvents = FALLBACK_EVENTS;
    }

    return NextResponse.json({ success: true, events: finalEvents });

  } catch (error: any) {
    console.error("fetchOnThisDay pipeline error:", error);
    // Generic fallback if Gemini is unreachable
    return NextResponse.json({ 
        success: true, 
        events: FALLBACK_EVENTS
    });
  }
}
