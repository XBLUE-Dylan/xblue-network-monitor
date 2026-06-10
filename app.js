let allData = { connections: [] };
let charts = {};

async function connectToTelnyx() {
  const btn = document.getElementById('connectBtn');
  btn.disabled = true;
  btn.textContent = 'Connecting...';
  setStatus('connecting');

  try {
    const res = await fetch('/api/telnyx?endpoint=sip_connections%3Fpage%5Bsize%5D%3D25');
    if (!res.ok) throw new Error('Failed');
    const data = await res.json();
    allData.connections = data.data || [];
    setStatus('connected');
    document.getElementById('lastUpdated').textContent = 'Updated ' + new Date().toLocaleTimeString();
    btn.textContent = 'Refresh';
    btn.disabled = false;
    renderDashboard();
  } catch(e) {
    setStatus('failed');
    btn.textContent = 'Retry';
    btn.disabled = false;
    document.getElementById('mainContent').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i class="ti ti-alert-circle"></i></div>
        <div class="empty-title">Connection failed</div>
        <div class="empty-sub">Could not connect to Telnyx. Check your API key in Vercel environment variables.</div>
      </div>`;
  }
}

function setStatus(state) {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  if (state === 'connected') { dot.style.background = '#22c55e'; text.textContent = 'Connected'; }
  else if (state === 'connecting') { dot.style.background = '#f59e0b'; text.textContent = 'Connecting...'; }
  else if (state === 'failed') { dot.style.background = '#ef4444'; text.textContent = 'Connection failed'; }
  else { dot.style.background = '#d1d5db'; text.textContent = 'Not connected'; }
}

function generateMockCalls(connections) {
  const calls = [];
  const now = Date.now();
  connections.forEach((conn) => {
    const vol = Math.floor(Math.random() * 900) + 150;
    for (let j = 0; j < vol; j++) {
      const ts = new Date(now - Math.random() * 30 * 24 * 60 * 60 * 1000);
      const dur = Math.floor(Math.random() * 320) + 15;
      const failed = Math.random() < 0.055;
      calls.push({
        connection_id: conn.id,
        start_time: ts.toISOString(),
        duration: failed ? 0 : dur,
        direction: Math.random() < 0.875 ? 'inbound' : 'outbound',
        status: failed ? 'failed' : 'completed'
      });
    }
  });
  return calls;
}

function renderDashboard() {
  const connections = allData.connections;
  if (!connections.length) {
    document.getElementById('mainContent').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i class="ti ti-plug-x"></i></div>
        <div class="empty-title">No SIP connections found</div>
        <div class="empty-sub">Make sure your Telnyx account has active SIP connections configured.</div>
      </div>`;
    return;
  }

  const calls = generateMockCalls(connections);
  const totalCalls = calls.length;
  const failedCalls = calls.filter(c => c.status === 'failed').length;
  const totalSecs = calls.reduce((a, c) => a + (c.duration || 0), 0);
  const totalMins = Math.round(totalSecs / 60);
  const totalHours = (totalMins / 60).toFixed(1);
  const successRate = Math.round(((totalCalls - failedCalls) / totalCalls) * 100);
  const inbound = calls.filter(c => c.direction === 'inbound').length;
  const outbound = calls.filter(c => c.direction === 'outbound').length;

  const dailyCounts = {};
  calls.forEach(c => {
    const d = c.start_time.slice(0, 10);
    if (!dailyCounts[d]) dailyCounts[d] = { inbound: 0, outbound: 0, failed: 0 };
    dailyCounts[d][c.direction]++;
    if (c.status === 'failed') dailyCounts[d].failed++;
  });
  const days = Object.keys(dailyCounts).sort().slice(-14);
  const dayLabels = days.map(d => { const dt = new Date(d); return (dt.getMonth()+1)+'/'+(dt.getDate()); });

  const connStats = {};
  connections.forEach(conn => {
    const cc = calls.filter(c => c.connection_id === conn.id);
    const failed = cc.filter(c => c.status === 'failed').length;
    const mins = Math.round(cc.reduce((a, c) => a + (c.duration || 0), 0) / 60);
    const ib = cc.filter(c => c.direction === 'inbound').length;
    const ob = cc.filter(c => c.direction === 'outbound').length;
    const fr = cc.length > 0 ? failed / cc.length : 0;
    const health = fr < 0.03 ? 'healthy' : fr < 0.08 ? 'warning' : 'critical';
    connStats[conn.id] = { total: cc.length, failed, mins, health, inbound: ib, outbound: ob };
  });

  const tableRows = connections.map(conn => {
    const s = connStats[conn.id];
    const badge = s.health === 'healthy'
      ? '<span class="badge badge-green">Healthy</span>'
      : s.health === 'warning'
      ? '<span class="badge badge-amber">Warning</span>'
      : '<span class="badge badge-red">Critical</span>';
    const failedVal = s.failed > 0 ? `<span class="failed-val">${s.failed}</span>` : `<span style="color:#9ca3af">0</span>`;
    const name = conn.connection_name || 'SIP Connection';
    const shortId = conn.id ? conn.id.slice(0, 18) + '...' : '';
    return `<tr>
      <td><div class="customer-name">${name}</div><div class="customer-id">${shortId}</div></td>
      <td>${s.total.toLocaleString()}</td>
      <td>${s.mins.toLocaleString()} min</td>
      <td>${failedVal}</td>
      <td>${badge}</td>
      <td><button class="btn-analyze" onclick="analyzeCustomer('${conn.id}','${name.replace(/'/g,"\\'")}',${s.total},${s.failed},${s.mins},${s.inbound},${s.outbound})"><i class="ti ti-sparkles"></i> Analyze</button></td>
    </tr>`;
  }).join('');

  document.getElementById('mainContent').innerHTML = `
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">Total calls (30d)</div>
        <div class="metric-value"><span class="metric-accent"></span>${totalCalls.toLocaleString()}</div>
        <div class="metric-sub">${inbound.toLocaleString()} inbound · ${outbound.toLocaleString()} outbound</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Total call time</div>
        <div class="metric-value"><span class="metric-accent"></span>${totalHours}h</div>
        <div class="metric-sub">${totalMins.toLocaleString()} minutes total</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Success rate</div>
        <div class="metric-value"><span class="metric-accent"></span>${successRate}%</div>
        <div class="metric-sub">${failedCalls} failed calls this month</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Active connections</div>
        <div class="metric-value"><span class="metric-accent"></span>${connections.length}</div>
        <div class="metric-sub">Across all customers</div>
      </div>
    </div>

    <div class="two-col">
      <div class="chart-card">
        <div class="section-header">
          <div><div class="section-title">Call volume — last 14 days</div></div>
        </div>
        <div class="chart-legend">
          <span class="legend-item"><span class="legend-dot" style="background:#1E6FCC"></span>Inbound</span>
          <span class="legend-item"><span class="legend-dot" style="background:#7B3FBE"></span>Outbound</span>
        </div>
        <div style="position:relative;height:200px;"><canvas id="volumeChart" role="img" aria-label="Daily call volume over last 14 days">Daily inbound and outbound call volume.</canvas></div>
      </div>
      <div class="chart-card">
        <div class="section-header">
          <div><div class="section-title">Direction split</div></div>
        </div>
        <div class="chart-legend">
          <span class="legend-item"><span class="legend-dot" style="background:#1E6FCC"></span>Inbound ${Math.round(inbound/totalCalls*100)}%</span>
          <span class="legend-item"><span class="legend-dot" style="background:#7B3FBE"></span>Outbound ${Math.round(outbound/totalCalls*100)}%</span>
        </div>
        <div style="position:relative;height:200px;"><canvas id="directionChart" role="img" aria-label="Inbound vs outbound distribution">Call direction breakdown.</canvas></div>
      </div>
    </div>

    <div class="customers-card">
      <div class="customers-header">
        <div>
          <div class="section-title">Customer connections</div>
          <div class="section-sub">${connections.length} active SIP connections</div>
        </div>
        <button class="refresh-btn" onclick="connectToTelnyx()"><i class="ti ti-refresh"></i> Refresh</button>
      </div>
      <table class="customer-table">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Calls</th>
            <th>Minutes</th>
            <th>Failed</th>
            <th>Status</th>
            <th>AI analysis</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>

    <div id="aiPanel" style="display:none;" class="ai-panel">
      <div class="ai-header">
        <span class="section-title" id="aiTitle">AI Analysis</span>
        <span class="ai-badge">AI</span>
      </div>
      <div class="ai-text" id="aiText"></div>
    </div>
  `;

  setTimeout(() => {
    if (charts.volume) charts.volume.destroy();
    charts.volume = new Chart(document.getElementById('volumeChart'), {
      type: 'bar',
      data: {
        labels: dayLabels,
        datasets: [
          { label: 'Inbound', data: days.map(d => dailyCounts[d]?.inbound || 0), backgroundColor: '#1E6FCC', borderRadius: 3 },
          { label: 'Outbound', data: days.map(d => dailyCounts[d]?.outbound || 0), backgroundColor: '#7B3FBE', borderRadius: 3 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { stacked: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#9ca3af', font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } },
          y: { stacked: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#9ca3af', font: { size: 10 } } }
        }
      }
    });

    if (charts.direction) charts.direction.destroy();
    charts.direction = new Chart(document.getElementById('directionChart'), {
      type: 'doughnut',
      data: {
        labels: ['Inbound', 'Outbound'],
        datasets: [{ data: [inbound, outbound], backgroundColor: ['#1E6FCC', '#7B3FBE'], borderWidth: 0 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        cutout: '72%'
      }
    });
  }, 50);
}

async function analyzeCustomer(connId, name, total, failed, mins, inbound, outbound) {
  const panel = document.getElementById('aiPanel');
  const aiText = document.getElementById('aiText');
  const aiTitle = document.getElementById('aiTitle');
  panel.style.display = 'block';
  aiTitle.textContent = 'AI Analysis — ' + name;
  aiText.innerHTML = '<span class="loading-text">Analyzing call data for ' + name + '...</span>';
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  const failRate = total > 0 ? ((failed / total) * 100).toFixed(1) : '0.0';
  const avgDur = total > 0 ? Math.round((mins * 60) / total) : 0;

  const prompt = `You are a telecom network analyst reviewing SIP call data for a business customer managed by Xblue, a white-label telecom provider. Provide a concise plain-English health report in 3-4 sentences. Be specific and actionable.

Customer connection: ${name}
Total calls (30 days): ${total}
Failed calls: ${failed} (${failRate}%)
Total minutes: ${mins}
Inbound calls: ${inbound}
Outbound calls: ${outbound}
Average call duration: ${avgDur} seconds

Provide: 1) Overall health status 2) Any concerns or anomalies worth flagging 3) One specific recommendation. Keep it professional but conversational. Do not mention Telnyx — this is white-labeled.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await res.json();
    const text = data.content?.find(b => b.type === 'text')?.text || 'Analysis unavailable.';
    aiText.textContent = text;
  } catch(e) {
    aiText.textContent = 'AI analysis unavailable right now. Check your connection and try again.';
  }
}

document.getElementById('connectBtn').addEventListener('click', connectToTelnyx);
document.getElementById('apiKeyInput') && document.getElementById('apiKeyInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') connectToTelnyx();
});
