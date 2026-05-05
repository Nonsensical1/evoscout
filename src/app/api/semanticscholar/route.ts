import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const doi = searchParams.get('doi');

  const title = searchParams.get('title');

  if (!doi) {
    return NextResponse.json({ error: 'DOI is required' }, { status: 400 });
  }

  const fields = 'title,authors,year,abstract,url';

  const filterSelf = (papers: any[]) => {
    if (!papers || !Array.isArray(papers)) return [];
    const queryDoi = doi ? doi.toLowerCase() : '';
    const queryTitle = title ? title.toLowerCase() : '';
    return papers.filter(p => {
      if (p.doi && queryDoi && p.doi.toLowerCase() === queryDoi) return false;
      if (p.title && queryTitle && p.title.toLowerCase() === queryTitle) return false;
      return true;
    });
  };

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
        const validPapers = filterSelf(data.recommendedPapers);
        if (validPapers.length > 0) {
          return NextResponse.json({ recommendedPapers: validPapers.slice(0, 5) });
        }
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
          const validPapers = filterSelf(searchData.data);
          if (validPapers.length > 0) {
            return NextResponse.json({ recommendedPapers: validPapers.slice(0, 5) });
          }
        }
      } else {
         console.error(`Semantic Scholar Fallback Search Error: ${searchRes.status} ${searchRes.statusText}`);
      }

      // 3. Groq-based Contextual Search Fallback
      console.warn(`[Semantic Scholar] Title search failed or returned empty. Using Groq fallback...`);
      try {
        const groqApiKey = process.env.GROQ_API_KEY;
        if (!groqApiKey) {
          console.warn("[Semantic Scholar] No GROQ_API_KEY provided. Skipping Groq fallback.");
          return NextResponse.json({ recommendedPapers: [] });
        }

        const prompt = `Analyze the following scientific paper title: "${title}"\nExtract the core scientific topic or terms and construct a concise, generalized search phrase (maximum 5 words) that can be used to find broad contextual background literature for this topic. Do not include the specific novel findings, just the general field or mechanisms. Return ONLY the search phrase, nothing else.`;

        const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${groqApiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.1,
            max_completion_tokens: 20,
          })
        });

        if (groqResponse.ok) {
          const groqData = await groqResponse.json();
          let searchPhrase = groqData.choices?.[0]?.message?.content?.trim();
          
          if (searchPhrase) {
            searchPhrase = searchPhrase.replace(/^"|"/g, '');
            console.log(`[Semantic Scholar] Groq generated search phrase: ${searchPhrase}`);
            
            await new Promise(r => setTimeout(r, 1200));
            
            const keywordSearchUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(searchPhrase)}&limit=15&fields=${fields}`;
            const keywordRes = await fetchWithRetry(keywordSearchUrl, { method: 'GET', headers: reqHeaders, next: { revalidate: 86400 } });
            
            if (keywordRes.ok) {
              const keywordData = await keywordRes.json();
              if (keywordData.data && keywordData.data.length > 0) {
                // Return the filtered results
                const validPapers = filterSelf(keywordData.data);
                if (validPapers.length > 0) {
                   return NextResponse.json({ recommendedPapers: validPapers.slice(0, 5) });
                } else {
                   console.warn(`[Semantic Scholar] Groq search returned papers but all were filtered out.`);
                }
              } else {
                console.warn(`[Semantic Scholar] Groq keyword search succeeded but returned 0 results.`);
              }
            } else {
              console.error(`[Semantic Scholar] Groq keyword search failed: HTTP ${keywordRes.status}`);
            }
          }
        } else {
          console.error(`[Semantic Scholar] Groq API call failed: ${groqResponse.status} ${groqResponse.statusText}`);
        }
      } catch (err) {
        console.error("Groq fallback error:", err);
      }
    }

    // 4. Complete Failure
    return NextResponse.json({ recommendedPapers: [] });
  } catch (error) {
    console.error("Semantic Scholar proxy error:", error);
    return NextResponse.json({ recommendedPapers: [] });
  }
}
