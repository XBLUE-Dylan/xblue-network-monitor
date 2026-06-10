export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const apiKey = process.env.TELNYX_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  const action = req.query.action || 'connections';

  try {
    if (action === 'connections') {
      const response = await fetch('https://api.telnyx.com/v2/connections?page[size]=25', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    }

    if (action === 'cdrs') {
      const page = req.query.page || '1';
      const url = `https://api.telnyx.com/v2/detail_records?filter[record_type]=voice&filter[date_range]=last_30_days&page[number]=${page}&page[size]=250&sort=-created_at`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to reach Telnyx API', details: error.message });
  }
}
