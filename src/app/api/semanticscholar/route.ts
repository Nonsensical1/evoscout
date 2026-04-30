import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const doi = searchParams.get('doi');

  if (!doi) {
    return NextResponse.json({ error: 'DOI is required' }, { status: 400 });
  }

  try {
    // We request 5 recommended background papers based on the DOI
    const apiUrl = `https://api.semanticscholar.org/recommendations/v1/papers/forpaper/DOI:${doi}?fields=title,authors,year,abstract,url&limit=5`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      // Cache recommendations for a long time since they don't change frequently and it protects against rate limits
      next: { revalidate: 86400 } 
    });

    if (!response.ok) {
      console.error(`Semantic Scholar API Error: ${response.status} ${response.statusText}`);
      // Return empty array instead of throwing an error to the frontend so the UI fails gracefully
      return NextResponse.json({ recommendedPapers: [] });
    }

    const data = await response.json();
    return NextResponse.json({ recommendedPapers: data.recommendedPapers || [] });
  } catch (error) {
    console.error("Semantic Scholar proxy error:", error);
    return NextResponse.json({ recommendedPapers: [] });
  }
}
