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
    // Explicitly enforce <1 request per second globally per invocation 
    // to protect the API key from concurrent burst limits
    await new Promise(r => setTimeout(r, 1200));

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
      
      // Enforce strict < 1 req/sec before fallback to protect API limits
      await new Promise(r => setTimeout(r, 1200));
      
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

      // 3. Keyword Extraction Fallback
      // If the title search failed (e.g. title too long, obscure, or rate limited), use Gemini to extract core keywords and try one final broad search.
      const geminiKey = process.env.GEMINI_API_KEY;
      if (geminiKey) {
        console.warn(`[Semantic Scholar] Title search failed or returned empty. Extracting keywords via Gemini...`);
        try {
          const prompt = `Extract the 2 to 3 most important scientific keywords from this paper title. Return ONLY the keywords separated by spaces. Title: "${title}"`;
          const gRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 20 }
            })
          });
          
          if (gRes.ok) {
            const gData = await gRes.json();
            const keywords = gData.candidates?.[0]?.content?.parts?.[0]?.text;
            if (keywords) {
              console.log(`[Semantic Scholar] Extracted keywords: ${keywords.trim()}`);
              await new Promise(r => setTimeout(r, 1200)); // Delay again to respect limits
              
              const keywordSearchUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(keywords.trim())}&limit=5&fields=${fields}`;
              const keywordRes = await fetchWithRetry(keywordSearchUrl, { method: 'GET', headers: reqHeaders, next: { revalidate: 86400 } });
              
              if (keywordRes.ok) {
                const keywordData = await keywordRes.json();
                if (keywordData.data && keywordData.data.length > 0) {
                  return NextResponse.json({ recommendedPapers: keywordData.data.slice(0, 5) });
                }
              }
            }
          }
        } catch (err) {
          console.error("Keyword fallback error:", err);
        }
      }
    }

    // 4. Complete Failure
    return NextResponse.json({ recommendedPapers: [] });
  } catch (error) {
    console.error("Semantic Scholar proxy error:", error);
    return NextResponse.json({ recommendedPapers: [] });
  }
}
