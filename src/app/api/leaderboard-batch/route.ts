import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

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

        // --- PHASE 1: Algorithmic DOI Extraction ---
        // Many high-impact journal RSS feeds embed the DOI directly in their URL.
        const batchDois: string[] = [];
        const itemsToSearch: any[] = [];
        const paperMap: Record<string, any> = {};

        // Extract DOIs from URLs to bypass rate-limited Title Search
        for (const item of targetItems) {
           let extractedDoi = "";
           
           if (item.doi) {
              extractedDoi = item.doi;
           } else if (item.id.includes("PUBMED-")) {
              extractedDoi = `PMID:${item.id.split("PUBMED-")[1]}`;
           } else if (item.url) {
              const url = item.url.toLowerCase();
              // Science, NEJM, PLOS often use /doi/full/10.xxxx or id=10.xxxx
              const doiMatch = url.match(/(10\.\d{4,9}\/[-._;()/:a-zA-Z0-9]+)/);
              if (doiMatch) {
                 extractedDoi = `DOI:${doiMatch[1]}`;
              } 
              // Nature uses /articles/s41586... -> DOI: 10.1038/s41586...
              else if (url.includes("nature.com/articles/")) {
                 const natMatch = url.match(/articles\/(s\d{5}-\d{3}-\d{4,5}-[a-z0-9])/);
                 if (natMatch) extractedDoi = `DOI:10.1038/${natMatch[1]}`;
              }
           }

           if (extractedDoi) {
              batchDois.push(extractedDoi);
              item.queryId = extractedDoi; // Save reference
           } else {
              itemsToSearch.push(item);
           }
        }

        // --- PHASE 2: Batch Query (Instant, no rate limit) ---
        if (batchDois.length > 0) {
           const batchRes = await fetch(`https://api.semanticscholar.org/graph/v1/paper/batch?fields=${fields}`, {
             method: "POST",
             headers: reqHeaders,
             body: JSON.stringify({ ids: batchDois })
           });
           if (batchRes.ok) {
              const batchData = await batchRes.json();
              batchData.forEach((paper: any) => {
                 if (paper && paper.paperId) {
                    paperMap[paper.paperId] = paper;
                    // Also map by external IDs to cross-reference
                    if (paper.externalIds?.DOI) paperMap[`DOI:${paper.externalIds.DOI.toLowerCase()}`] = paper;
                    if (paper.externalIds?.PubMed) paperMap[`PMID:${paper.externalIds.PubMed}`] = paper;
                 }
              });
           }
        }

        // --- PHASE 3: Title Search Fallback (Capped to prevent timeout) ---
        // Vercel timeouts at 15s. We can only afford ~5 title searches max.
        const searchCap = itemsToSearch.slice(0, 5);
        for (const item of searchCap) {
           await new Promise(r => setTimeout(r, 1100)); // 1 req/sec strict rate limit
           let cleanTitle = item.title.replace(/[^a-zA-Z0-9 ]/g, " ");
           const res = await fetch(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(cleanTitle)}&limit=1&fields=${fields}`, { headers: reqHeaders });
           if (res.ok) {
             const data = await res.json();
             if (data.data && data.data.length > 0) {
                const paper = data.data[0];
                paperMap[paper.paperId] = paper;
                item.queryId = paper.paperId;
             }
           }
        }

        // --- PHASE 4: Cheerio Scraping (Accesses) ---
        // Fetch accesses/views for all items concurrently to incorporate into algorithm
        await Promise.all(targetItems.map(async (item: any) => {
           if (!item.url) return;
           try {
             // 3-second timeout to prevent vercel edge function hanging
             const controller = new AbortController();
             const timeoutId = setTimeout(() => controller.abort(), 3000); 
             const pageRes = await fetch(item.url, { 
               headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EvoScoutBot/1.0)' },
               signal: controller.signal
             });
             clearTimeout(timeoutId);

             if (pageRes.ok) {
               const html = await pageRes.text();
               const $ = cheerio.load(html);
               let scrapedCount = 0;
               
               const accessesMatch = html.match(/([\d,]+)\s+(?:Accesses|Views)/i) || html.match(/(?:Views|Accesses):\s*([\d,]+)/i);
               if (accessesMatch) {
                  scrapedCount = parseInt(accessesMatch[1].replace(/,/g, ''), 10);
               } else {
                  const metricText = $('.c-article-metrics__views, .metrics, .article-metrics, .js-metrics').text();
                  const textMatch = metricText.match(/([\d,]+)/);
                  if (textMatch) scrapedCount = parseInt(textMatch[1].replace(/,/g, ''), 10);
               }

               if (scrapedCount > 0) {
                  let paper = null;
                  if (item.queryId && paperMap[item.queryId]) {
                    paper = paperMap[item.queryId];
                  } else {
                    paper = Object.values(paperMap).find(p => p.paperId === item.queryId);
                  }
                  
                  if (paper) {
                    paper.accessesCount = scrapedCount;
                  } else {
                    const fallbackId = `SCRAPED-${item.id}`;
                    paperMap[fallbackId] = {
                      paperId: fallbackId,
                      title: item.title,
                      authors: [{ name: "Authors (Data from Journal)" }],
                      citationCount: 0, 
                      influentialCitationCount: 0,
                      accessesCount: scrapedCount,
                      abstract: item.snippet || item.rawSnippet || "",
                      url: item.url
                    };
                    item.queryId = fallbackId;
                  }
               }
             }
           } catch (e) {
             // Ignore aborts or errors to keep batch moving
           }
        }));

        // --- PHASE 5: Reconstruct Results ---
        for (const item of targetItems) {
           let paper = null;
           
           if (item.queryId && paperMap[item.queryId]) {
              paper = paperMap[item.queryId];
           } else {
              paper = Object.values(paperMap).find(p => p.paperId === item.queryId);
           }

           if (paper) {
             results.push({
               originalId: item.id,
               paperId: paper.paperId,
               title: paper.title,
               authors: paper.authors ? paper.authors.map((a:any)=>a.name).join(', ') : "Various Authors",
               citationCount: paper.citationCount || 0,
               influentialCitationCount: paper.influentialCitationCount || 0,
               accessesCount: paper.accessesCount || 0,
               abstract: paper.abstract || item.snippet || "",
               url: paper.url || item.url
             });
           }
        }

    return NextResponse.json(results);
  } catch (error) {
    console.error("Semantic Scholar batch proxy internal error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
