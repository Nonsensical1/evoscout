import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const doi = searchParams.get('doi');

  const title = searchParams.get('title');

  if (!doi) {
    return NextResponse.json({ error: 'DOI is required' }, { status: 400 });
  }

  const fields = 'title,authors,year,abstract,url';

  // Helper to retry fetches on 429 Too Many Requests
  const fetchWithRetry = async (url: string, options: any, retries = 2) => {
    for (let i = 0; i < retries; i++) {
      const res = await fetch(url, options);
      if (res.status === 429) {
        console.warn(`[Semantic Scholar] 429 Rate Limit Hit. Retrying... (${i + 1}/${retries})`);
        await new Promise(r => setTimeout(r, 1200)); // wait 1.2s
        continue;
      }
      return res;
    }
    return fetch(url, options); // Final attempt
  };

  try {
    // 1. First try the true recommendations endpoint
    const recommendUrl = `https://api.semanticscholar.org/recommendations/v1/papers/forpaper/DOI:${doi}?fields=${fields}&limit=5`;
    
    let response = await fetchWithRetry(recommendUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 86400 } 
    });

    if (response.ok) {
      const data = await response.json();
      if (data.recommendedPapers && data.recommendedPapers.length > 0) {
        return NextResponse.json({ recommendedPapers: data.recommendedPapers });
      }
    }

    // 2. Fallback: If paper isn't indexed yet (404) or has no recommendations, perform a semantic search on its title
    if (title) {
      console.log(`[Semantic Scholar] DOI ${doi} missing recommendations. Falling back to title search.`);
      const searchUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(title)}&limit=6&fields=${fields}`;
      
      const searchRes = await fetchWithRetry(searchUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 86400 }
      });

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.data && searchData.data.length > 0) {
          // Take up to 5 results to serve as contextual background
          return NextResponse.json({ recommendedPapers: searchData.data.slice(0, 5) });
        }
      } else {
         console.error(`Semantic Scholar Fallback Search Error: ${searchRes.status} ${searchRes.statusText}`);
      }
    }

    // 3. Absolute fallback
    return NextResponse.json({ recommendedPapers: [] });
  } catch (error) {
    console.error("Semantic Scholar proxy error:", error);
    return NextResponse.json({ recommendedPapers: [] });
  }
}
