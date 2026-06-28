const fetch = require('node-fetch');
async function run() {
  const govRes = await fetch("https://apply07.grants.gov/grantsws/rest/opportunities/search/", {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword: "neurofibromatosis" })
  });
  const data = await govRes.json();
  const hits = data.oppHits || [];
  
  for (const h of hits) {
    if (h.oppStatus !== 'posted') continue;
    const detailRes = await fetch("https://apply07.grants.gov/grantsws/rest/opportunity/details", {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `oppId=${h.id}`
    });
    const detail = await detailRes.json();
    console.log(h.id, h.title);
    if (detail.synopsis && detail.synopsis.estimatedFunding) {
      console.log('FUNDING:', detail.synopsis.estimatedFunding);
    } else {
      console.log('FUNDING: NONE');
    }
  }
}
run();
