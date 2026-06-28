import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const ids = body.ids || [];

    if (!ids.length) {
      return NextResponse.json([]);
    }

    const results = [];
    
    // Altmetric has rate limits, so we will batch them in small chunks
    // To speed up the UI, we only fetch the first 30 most recent/relevant papers if the array is huge
    const targetIds = ids.slice(0, 30);

    for (const rawId of targetIds) {
      try {
        let endpoint = "";
        let cleanId = "";
        
        if (rawId.startsWith("DOI:")) {
          endpoint = "doi";
          cleanId = rawId.replace("DOI:", "");
        } else if (rawId.startsWith("PMID:")) {
          endpoint = "pmid";
          cleanId = rawId.replace("PMID:", "");
        } else if (rawId.startsWith("ARXIV:")) {
          endpoint = "arxiv";
          cleanId = rawId.replace("ARXIV:", "");
        } else {
          continue;
        }

        const url = `https://api.altmetric.com/v1/${endpoint}/${encodeURIComponent(cleanId)}`;
        const res = await fetch(url);
        
        if (res.ok) {
          const data = await res.json();
          results.push({
            id: rawId,
            score: data.score || 0
          });
        } else {
           results.push({ id: rawId, score: 0 });
        }
      } catch(e) {
        results.push({ id: rawId, score: 0 });
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("Altmetric proxy error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
