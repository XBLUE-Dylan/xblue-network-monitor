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
  const auth = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

  try {
    if (action === 'connections') {
      const r = await fetch('https://api.telnyx.com/v2/connections?page[size]=25', { headers: auth });
      const data = await r.json();
      return res.status(r.status).json(data);
    }

    if (action === 'create_report') {
      const end = new Date();
      const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const r = await fetch('https://api.telnyx.com/v2/legacy_reporting/batch_detail_records/voice', {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          report_name: 'xblue_monitor_' + Date.now()
        })
      });
      const data = await r.json();
      return res.status(r.status).json(data);
    }

    if (action === 'check_report') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'No report id' });
      const r = await fetch('https://api.telnyx.com/v2/legacy_reporting/batch_detail_records/voice/' + id, { headers: auth });
      const data = await r.json();
      return res.status(r.status).json(data);
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to reach Telnyx API', details: error.message });
  }
}
