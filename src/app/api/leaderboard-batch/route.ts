import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const items = body.items || []; // Array of { id, title, doi }

    if (!items.length) {
      return NextResponse.json([]);
    }

    const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY;
    const reqHeaders: any = { 'Content-Type': 'application/json' };
    if (apiKey) {
      reqHeaders['x-api-key'] = apiKey;
    }

    const results = [];
    const fields = "title,authors,citationCount,influentialCitationCount,abstract,url,externalIds";

    // Rate limit control
    const targetItems = items.slice(0, 15); // Cap at 15 to avoid massive delays

    for (const item of targetItems) {
      try {
        let paper = null;

        // If it's a PubMed paper (already has an ID)
        if (item.doi || item.id.includes("PUBMED")) {
           let queryId = "";
           if (item.doi) {
             let rawDoi = item.doi.replace("https://doi.org/", "").replace("http://doi.org/", "");
             if (rawDoi.startsWith("10.")) queryId = `DOI:${rawDoi}`;
           } else if (item.id.includes("PUBMED-")) {
             queryId = `PMID:${item.id.split("PUBMED-")[1]}`;
           }

           if (queryId) {
             const res = await fetch(`https://api.semanticscholar.org/graph/v1/paper/${queryId}?fields=${fields}`, { headers: reqHeaders });
             if (res.ok) {
               paper = await res.json();
             }
           }
        }

        // If it's a generic news article, reverse-map using a Title search
        if (!paper && item.title) {
           await new Promise(r => setTimeout(r, 1100)); // 1 req/sec strict rate limit for searches
           
           // Clean title for search
           let cleanTitle = item.title.replace(/[^a-zA-Z0-9 ]/g, " ");
           const res = await fetch(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(cleanTitle)}&limit=1&fields=${fields}`, { headers: reqHeaders });
           if (res.ok) {
             const data = await res.json();
             if (data.data && data.data.length > 0) {
                paper = data.data[0];
             }
           }
        }

        if (paper) {
          results.push({
            originalId: item.id,
            paperId: paper.paperId,
            title: paper.title,
            authors: paper.authors ? paper.authors.map((a:any)=>a.name).join(', ') : "Various Authors",
            citationCount: paper.citationCount || 0,
            influentialCitationCount: paper.influentialCitationCount || 0,
            abstract: paper.abstract || item.snippet || "",
            url: paper.url || item.url
          });
        }

      } catch (e) {
        console.error("Reverse mapping error for item:", item.id, e);
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("Semantic Scholar batch proxy internal error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
