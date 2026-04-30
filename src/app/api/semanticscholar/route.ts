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
    let delay = 3000; // start with a generous 3 second wait
    for (let i = 0; i < retries; i++) {
      const res = await fetch(url, options);
      if (res.status === 429) {
        console.warn(`[Semantic Scholar] 429 Rate Limit Hit. Retrying in ${delay}ms... (${i + 1}/${retries})`);
        await new Promise(r => setTimeout(r, delay));
        delay += 1500; // 3s -> 4.5s -> 6s
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

    // 3. Absolute Fallback: Gemini AI Synthesized Context
    // If Semantic Scholar is completely rate-limiting us or has no data, we ask Gemini to synthesize the background context directly.
    console.warn(`[Semantic Scholar] All API attempts failed or returned empty for DOI ${doi}. Engaging Gemini AI fallback.`);
    
    if (title) {
      const geminiKey = process.env.GEMINI_API_KEY;
      if (geminiKey) {
        try {
          const prompt = `As an expert scientific researcher, provide a 3-4 sentence background context explaining the core concepts, importance, and foundation for a newly published paper titled: "${title}". Focus strictly on the scientific background. Do not wrap in markdown or quotes, just return the raw paragraph.`;
          
          const gRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 250 }
            })
          });
          
          if (gRes.ok) {
            const gData = await gRes.json();
            const abstract = gData.candidates?.[0]?.content?.parts?.[0]?.text;
            
            if (abstract) {
              return NextResponse.json({
                recommendedPapers: [{
                  paperId: 'evoscout-ai-synthetic-context',
                  title: 'Synthesized Background Context',
                  authors: [{ name: 'EvoScout AI Synthesis Engine' }],
                  year: new Date().getFullYear(),
                  abstract: abstract.trim(),
                  url: `https://doi.org/${doi}` // Just link back to the paper
                }]
              });
            }
          }
        } catch (geminiErr) {
          console.error("Gemini context fallback error:", geminiErr);
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
