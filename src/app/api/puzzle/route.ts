import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const minRating = searchParams.get('minRating') || '1000';
  const maxRating = searchParams.get('maxRating') || '1100';

  try {
    const res = await fetch(`https://chess-puzzles-api.vercel.app/puzzles?themes=mate&min_rating=${minRating}&max_rating=${maxRating}&limit=50`);
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    } else {
      return NextResponse.json({ error: "Upstream failed" }, { status: res.status });
    }
  } catch (error) {
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
  }
}
