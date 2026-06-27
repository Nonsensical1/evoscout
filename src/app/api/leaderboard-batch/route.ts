import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const ids = body.ids || [];

    if (!ids.length) {
      return NextResponse.json([]);
    }

    const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY;
    const reqHeaders: any = { 'Content-Type': 'application/json' };
    if (apiKey) {
      reqHeaders['x-api-key'] = apiKey;
    }

    const url = "https://api.semanticscholar.org/graph/v1/paper/batch?fields=citationCount,influentialCitationCount";

    const res = await fetch(url, {
      method: "POST",
      headers: reqHeaders,
      body: JSON.stringify({ ids })
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    } else {
      console.error("Semantic Scholar batch proxy failed:", res.status, res.statusText);
      return NextResponse.json({ error: "API Failure" }, { status: res.status });
    }
  } catch (error) {
    console.error("Semantic Scholar batch proxy internal error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
