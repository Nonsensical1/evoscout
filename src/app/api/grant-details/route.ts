import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { oppId } = await req.json();
    if (!oppId) return NextResponse.json({ error: "Missing oppId" }, { status: 400 });

    const detailRes = await fetch("https://apply07.grants.gov/grantsws/rest/opportunity/details", {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `oppId=${oppId}`
    });

    if (detailRes.ok) {
      const detailData = await detailRes.json();
      if (detailData.synopsis && detailData.synopsis.estimatedFunding) {
        return NextResponse.json({ estimatedFunding: detailData.synopsis.estimatedFunding });
      }
    }
    return NextResponse.json({ estimatedFunding: null });
  } catch (error) {
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
  }
}
