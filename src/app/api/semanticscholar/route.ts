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

      // 3. Keyword Extraction Fallback (Local Algorithm)
      // If the title search failed, use a local stopword filter to extract 50-60% of the core scientific keywords
      // and try one final broad search without relying on rate-limited AI APIs.
      console.warn(`[Semantic Scholar] Title search failed or returned empty. Extracting keywords locally...`);
      try {
        const stopWords = new Set([
          'the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from', 'of', 'about', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'doing', 'can', 'could', 'will', 'would', 'may', 'might', 'must', 'should', 'shall', 
          'new', 'how', 'why', 'what', 'where', 'when', 'who', 'which', 'while', 'within', 'without', 'over', 'under', 'above', 'below', 'before', 'after', 
          'study', 'studies', 'research', 'scientists', 'discover', 'discovery', 'finds', 'findings', 'shows', 'reveals', 'uncovers', 'identifies', 'novel', 'allows', 'using', 'during', 'expression', 'mechanism', 'mechanisms', 'analysis', 'through', 'between', 'human', 'their', 'these', 'those', 'that', 'this', 'than', 'then', 'its', 'based', 'approach', 'method', 'methodology', 'toward', 'towards', 'into', 
          'effect', 'effects', 'role', 'impact', 'evaluate', 'evaluating', 'evaluation', 'analyze', 'analyzing', 'investigate', 'investigation', 'review', 'systematic', 'meta-analysis', 'case', 'report', 'clinical', 'trial', 'assessment', 'assess', 'determine', 'determining', 'determination', 'explore', 'exploring', 'exploration', 'understanding', 'understand', 'overview', 'update', 
          'model', 'models', 'system', 'systems', 'development', 'developing', 'develop', 'application', 'applications', 'implications', 'future', 'directions', 'perspectives', 'perspective', 'insights', 'insight', 'evidence', 'data', 'results', 'structure', 'function', 'properties', 'characterization', 'characteristics', 'design', 'performance', 'response', 'responses', 'activity', 'activities'
        ]);
        const words = title.replace(/[^a-zA-Z0-9 -]/g, ' ').split(/\s+/);
        const keywordsArray = words.filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()));
        
        // Take the top 5-6 significant keywords to represent ~50-60% of typical academic titles
        const keywords = keywordsArray.slice(0, 6).join(' ');

        if (keywords) {
          console.log(`[Semantic Scholar] Extracted keywords: ${keywords.trim()}`);
          await new Promise(r => setTimeout(r, 1200)); // Delay again to respect limits
          
          const keywordSearchUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(keywords.trim())}&limit=5&fields=${fields}`;
          const keywordRes = await fetchWithRetry(keywordSearchUrl, { method: 'GET', headers: reqHeaders, next: { revalidate: 86400 } });
          
          if (keywordRes.ok) {
            const keywordData = await keywordRes.json();
            if (keywordData.data && keywordData.data.length > 0) {
              return NextResponse.json({ recommendedPapers: keywordData.data.slice(0, 5) });
            } else {
              console.warn(`[Semantic Scholar] Keyword search succeeded but returned 0 results.`);
            }
          } else {
            console.error(`[Semantic Scholar] Keyword search failed: HTTP ${keywordRes.status}`);
          }
        }
      } catch (err) {
        console.error("Local keyword fallback error:", err);
      }
    }

    // 4. Complete Failure
    return NextResponse.json({ recommendedPapers: [] });
  } catch (error) {
    console.error("Semantic Scholar proxy error:", error);
    return NextResponse.json({ recommendedPapers: [] });
  }
}
