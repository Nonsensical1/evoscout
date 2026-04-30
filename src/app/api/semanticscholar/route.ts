import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const doi = searchParams.get('doi');

  const title = searchParams.get('title');

  if (!doi) {
    return NextResponse.json({ error: 'DOI is required' }, { status: 400 });
  }

  const fields = 'title,authors,year,abstract,url';

  // Helper to retry fetches on 429 Too Many Requests with exponential backoff
  const fetchWithRetry = async (url: string, options: any, retries = 3) => {
    let delay = 5000; // start with a very generous 5 second wait to ensure Semantic Scholar resets
    for (let i = 0; i < retries; i++) {
      const res = await fetch(url, options);
      if (res.status === 429) {
        console.warn(`[Semantic Scholar] 429 Rate Limit Hit. Retrying in ${delay}ms... (${i + 1}/${retries})`);
        await new Promise(r => setTimeout(r, delay));
        delay += 3000; // 5s -> 8s -> 11s
        continue;
      }
      return res;
    }
    return fetch(url, options); // Final attempt
  };

  const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY;
  const reqHeaders: any = { 'Accept': 'application/json' };
  if (apiKey) {
    reqHeaders['x-api-key'] = apiKey;
  }

  try {
    // 1. First try the true recommendations endpoint
    const recommendUrl = `https://api.semanticscholar.org/recommendations/v1/papers/forpaper/DOI:${doi}?fields=${fields}&limit=5`;
    
    let response = await fetchWithRetry(recommendUrl, {
      method: 'GET',
      headers: reqHeaders,
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
        headers: reqHeaders,
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

    // 3. Complete Failure
    return NextResponse.json({ recommendedPapers: [] });
  } catch (error) {
    console.error("Semantic Scholar proxy error:", error);
    return NextResponse.json({ recommendedPapers: [] });
  }
}
