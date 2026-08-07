const { STATUS_STEPS, humanizeStatus, formatEstimate } = require('./emailTemplate');

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTimeLocal(value) {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDisplayDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

const STYLES = `
  :root {
    --navy-900: #0a2344; --signal: #b93425; --signal-dark: #9f2d20;
    --paper: #f7f8f6; --ink: #11233a; --muted: #4e5f73; --line: #d8dde2; --white: #fff;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--paper); color: var(--ink); font-family: -apple-system, "Segoe UI", Arial, sans-serif; font-size: 15px; }
  a { color: var(--signal); }
  header.admin-bar { display: flex; align-items: center; justify-content: space-between; background: var(--navy-900); color: #fff; padding: 14px 24px; }
  header.admin-bar .brand { font-weight: 800; letter-spacing: -0.02em; }
  header.admin-bar .brand span { color: #ff8a73; }
  header.admin-bar nav a, header.admin-bar nav button { color: #fff; margin-left: 16px; font-size: 14px; }
  .container { max-width: 1080px; margin: 0 auto; padding: 28px 24px 60px; }
  h1 { font-size: 1.6rem; margin: 0 0 4px; }
  h2 { font-size: 1.2rem; margin: 0 0 12px; }
  .card { background: #fff; border: 1px solid var(--line); border-radius: 6px; padding: 20px 24px; margin-bottom: 24px; }
  .flash { padding: 12px 16px; border-radius: 4px; margin-bottom: 20px; font-size: 14px; }
  .flash.success { background: #e4f3ea; color: #14633e; border: 1px solid #b9dfc9; }
  .flash.error { background: #fbe9e7; color: #9f271b; border: 1px solid #f0c4bd; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line); }
  th { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
  tr:hover td { background: #fafbfa; }
  .badge { display: inline-block; padding: 3px 9px; border-radius: 20px; font-size: 12px; font-weight: 700; }
  .badge.order_placed, .badge.picked_up { background: #e7ebef; color: var(--navy-900); }
  .badge.in_transit, .badge.out_for_delivery { background: #fbe9e7; color: var(--signal-dark); }
  .badge.delivered { background: #e4f3ea; color: #14633e; }
  form.filters { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
  input, select, button { font: inherit; }
  input[type=text], input[type=email], input[type=number], input[type=datetime-local], select {
    padding: 9px 11px; border: 1px solid #c3ccd4; border-radius: 4px; color: var(--ink); background: #fff;
  }
  .btn { display: inline-block; padding: 9px 18px; border: 0; border-radius: 4px; background: var(--signal); color: #fff; font-weight: 700; cursor: pointer; text-decoration: none; }
  .btn:hover { background: var(--signal-dark); }
  .btn.secondary { background: var(--navy-900); }
  .btn.secondary:hover { background: #14345c; }
  .btn.ghost { background: #fff; color: var(--ink); border: 1px solid #c3ccd4; }
  .field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 20px; }
  .field-grid label { display: block; font-size: 12px; font-weight: 700; color: var(--muted); margin-bottom: 5px; }
  .field-grid input, .field-grid select { width: 100%; }
  .field-grid .full { grid-column: 1 / -1; }
  .actions-row { margin-top: 20px; display: flex; gap: 12px; }
  .summary-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px 28px; font-size: 14px; }
  .summary-grid dt { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; margin: 0; }
  .summary-grid dd { margin: 3px 0 0; font-weight: 700; }
  .login-shell { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .login-card { width: 320px; background: #fff; border: 1px solid var(--line); border-radius: 6px; padding: 32px; text-align: center; }
  .empty-state { color: var(--muted); padding: 24px 0; text-align: center; }
`;

function layout({ title, body, session }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex, nofollow" />
<title>${escapeHtml(title)} · Rezoro Express Admin</title>
<style>${STYLES}</style>
</head>
<body>
${session ? `<header class="admin-bar">
  <div class="brand">rezoro<span>express</span> admin</div>
  <nav>
    <a href="/admin">Dashboard</a>
    <a href="/admin/shipments/new">New shipment</a>
    <form method="POST" action="/admin/logout" style="display:inline;">
      <button type="submit" style="background:none;border:0;cursor:pointer;padding:0;text-decoration:underline;">Log out</button>
    </form>
  </nav>
</header>` : ''}
<div class="container">
${body}
</div>
</body>
</html>`;
}

function renderFlash(flash) {
  if (!flash) return '';
  return `<div class="flash ${flash.type === 'error' ? 'error' : 'success'}">${escapeHtml(flash.message)}</div>`;
}

function renderLoginPage({ error } = {}) {
  return layout({
    title: 'Log in',
    session: false,
    body: `
      <div class="login-shell">
        <div class="login-card">
          <h1 style="margin-bottom:20px;">rezoro<span style="color:#b93425;">express</span></h1>
          ${error ? `<div class="flash error">${escapeHtml(error)}</div>` : ''}
          <form method="POST" action="/admin/login">
            <input type="password" name="password" placeholder="Admin password" autofocus required style="width:100%; margin-bottom:14px;" />
            <button type="submit" class="btn" style="width:100%;">Log in</button>
          </form>
        </div>
      </div>`,
  });
}

function statusOptions(selected) {
  return STATUS_STEPS.map((s) => `<option value="${s}" ${s === selected ? 'selected' : ''}>${escapeHtml(humanizeStatus(s))}</option>`).join('');
}

function renderDashboard({ shipments, q, status, flash }) {
  const rows = shipments.length
    ? shipments.map((s) => `
      <tr>
        <td><a href="/admin/shipments/${encodeURIComponent(s.tracking_number)}">${escapeHtml(s.tracking_number)}</a></td>
        <td><span class="badge ${escapeHtml(s.status)}">${escapeHtml(humanizeStatus(s.status))}</span></td>
        <td>${escapeHtml(s.origin_city)}, ${escapeHtml(s.origin_state)}</td>
        <td>${escapeHtml(s.destination_city)}, ${escapeHtml(s.destination_state)}</td>
        <td>${escapeHtml(s.recipient_email)}</td>
        <td>${formatDisplayDate(s.updated_at)}</td>
      </tr>`).join('')
    : `<tr><td colspan="6" class="empty-state">No shipments match.</td></tr>`;

  return layout({
    title: 'Dashboard',
    session: true,
    body: `
      <h1>Shipments</h1>
      ${renderFlash(flash)}
      <form class="filters" method="GET" action="/admin">
        <input type="text" name="q" placeholder="Search tracking number or email" value="${escapeHtml(q || '')}" />
        <select name="status">
          <option value="">All statuses</option>
          ${statusOptions(status)}
        </select>
        <button type="submit" class="btn ghost">Filter</button>
      </form>
      <div class="card" style="padding:0;">
        <table>
          <thead><tr><th>Tracking #</th><th>Status</th><th>Origin</th><th>Destination</th><th>Recipient</th><th>Last updated</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`,
  });
}

function shipmentFormFields(s = {}) {
  return `
    <div class="field-grid">
      <div><label>Origin city</label><input type="text" name="origin_city" value="${escapeHtml(s.origin_city)}" required /></div>
      <div><label>Origin state</label><input type="text" name="origin_state" value="${escapeHtml(s.origin_state)}" required /></div>
      <div><label>Origin latitude</label><input type="number" step="any" name="origin_lat" value="${escapeHtml(s.origin_lat)}" required /></div>
      <div><label>Origin longitude</label><input type="number" step="any" name="origin_lng" value="${escapeHtml(s.origin_lng)}" required /></div>
      <div><label>Destination city</label><input type="text" name="destination_city" value="${escapeHtml(s.destination_city)}" required /></div>
      <div><label>Destination state</label><input type="text" name="destination_state" value="${escapeHtml(s.destination_state)}" required /></div>
      <div><label>Destination latitude</label><input type="number" step="any" name="destination_lat" value="${escapeHtml(s.destination_lat)}" required /></div>
      <div><label>Destination longitude</label><input type="number" step="any" name="destination_lng" value="${escapeHtml(s.destination_lng)}" required /></div>
      <div><label>Recipient email</label><input type="email" name="recipient_email" value="${escapeHtml(s.recipient_email)}" required /></div>
      <div><label>Service type</label><input type="text" name="service_type" value="${escapeHtml(s.service_type || 'Rezoro Priority')}" required /></div>
      <div><label>Estimated delivery start</label><input type="datetime-local" name="estimated_delivery_start" value="${formatDateTimeLocal(s.estimated_delivery_start)}" required /></div>
      <div><label>Estimated delivery end</label><input type="datetime-local" name="estimated_delivery_end" value="${formatDateTimeLocal(s.estimated_delivery_end)}" required /></div>
    </div>`;
}

function renderNewShipmentForm({ error, formData } = {}) {
  return layout({
    title: 'New shipment',
    session: true,
    body: `
      <h1>New shipment</h1>
      ${error ? `<div class="flash error">${escapeHtml(error)}</div>` : ''}
      <div class="card">
        <form method="POST" action="/admin/shipments/new">
          <div class="field-grid">
            <div class="full">
              <label>Tracking number (leave blank to auto-generate)</label>
              <input type="text" name="tracking_number" value="${escapeHtml(formData && formData.tracking_number)}" placeholder="RZX482901763" />
            </div>
          </div>
          ${shipmentFormFields(formData || {})}
          <div class="actions-row">
            <button type="submit" class="btn">Create shipment</button>
            <a href="/admin" class="btn ghost">Cancel</a>
          </div>
        </form>
      </div>`,
  });
}

function renderEditShipmentForm({ shipment, error }) {
  return layout({
    title: `Edit ${shipment.tracking_number}`,
    session: true,
    body: `
      <h1>Edit shipment</h1>
      <p style="color:var(--muted); margin-top:-6px;">${escapeHtml(shipment.tracking_number)} — tracking number can't be changed here.</p>
      ${error ? `<div class="flash error">${escapeHtml(error)}</div>` : ''}
      <div class="card">
        <form method="POST" action="/admin/shipments/${encodeURIComponent(shipment.tracking_number)}/edit">
          ${shipmentFormFields(shipment)}
          <div class="actions-row">
            <button type="submit" class="btn">Save changes</button>
            <a href="/admin/shipments/${encodeURIComponent(shipment.tracking_number)}" class="btn ghost">Cancel</a>
          </div>
        </form>
      </div>`,
  });
}

function renderShipmentDetail({ shipment, scanEvents, flash }) {
  const scanRows = scanEvents.length
    ? scanEvents.map((e) => `
      <tr>
        <td>${formatDisplayDate(e.occurred_at)}</td>
        <td><span class="badge ${escapeHtml(e.status)}">${escapeHtml(humanizeStatus(e.status))}</span></td>
        <td>${escapeHtml(e.location_city)}, ${escapeHtml(e.location_state)}</td>
        <td>${e.email_sent ? 'Sent' : 'Not sent'}</td>
      </tr>`).join('')
    : `<tr><td colspan="4" class="empty-state">No scan events yet.</td></tr>`;

  return layout({
    title: shipment.tracking_number,
    session: true,
    body: `
      <h1>${escapeHtml(shipment.tracking_number)}</h1>
      <p style="margin-top:-6px;"><span class="badge ${escapeHtml(shipment.status)}">${escapeHtml(humanizeStatus(shipment.status))}</span></p>
      ${renderFlash(flash)}

      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:start;">
          <h2>Shipment details</h2>
          <a href="/admin/shipments/${encodeURIComponent(shipment.tracking_number)}/edit" class="btn ghost">Edit details</a>
        </div>
        <dl class="summary-grid">
          <div><dt>Origin</dt><dd>${escapeHtml(shipment.origin_city)}, ${escapeHtml(shipment.origin_state)}</dd></div>
          <div><dt>Destination</dt><dd>${escapeHtml(shipment.destination_city)}, ${escapeHtml(shipment.destination_state)}</dd></div>
          <div><dt>Recipient</dt><dd>${escapeHtml(shipment.recipient_email)}</dd></div>
          <div><dt>Service</dt><dd>${escapeHtml(shipment.service_type)}</dd></div>
          <div><dt>Estimated delivery</dt><dd>${escapeHtml(formatEstimate(shipment.estimated_delivery_start, shipment.estimated_delivery_end))}</dd></div>
          <div><dt>Last updated</dt><dd>${formatDisplayDate(shipment.updated_at)}</dd></div>
        </dl>
        <form method="POST" action="/admin/shipments/${encodeURIComponent(shipment.tracking_number)}/resend-email" style="margin-top:18px;" onsubmit="return confirm('Resend the current status email to ${escapeHtml(shipment.recipient_email)}?');">
          <button type="submit" class="btn secondary">Resend status email</button>
        </form>
      </div>

      <div class="card">
        <h2>Add scan event</h2>
        <form method="POST" action="/admin/shipments/${encodeURIComponent(shipment.tracking_number)}/scan">
          <div class="field-grid">
            <div><label>Status</label><select name="status" required><option value="">Select a status</option>${statusOptions()}</select></div>
            <div></div>
            <div><label>Location city</label><input type="text" name="location_city" required /></div>
            <div><label>Location state</label><input type="text" name="location_state" required /></div>
          </div>
          <div class="actions-row"><button type="submit" class="btn">Submit scan event</button></div>
        </form>
      </div>

      <div class="card" style="padding:0;">
        <h2 style="padding:20px 24px 0;">Scan history</h2>
        <table>
          <thead><tr><th>Occurred</th><th>Status</th><th>Location</th><th>Email</th></tr></thead>
          <tbody>${scanRows}</tbody>
        </table>
      </div>`,
  });
}

module.exports = {
  escapeHtml,
  renderLoginPage,
  renderDashboard,
  renderNewShipmentForm,
  renderEditShipmentForm,
  renderShipmentDetail,
};
