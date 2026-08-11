const STATUS_STEPS = ['order_placed', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered'];

// Icons are hosted PNGs (public/icons/{icon}-{color}.png, served statically by server.js)
// rather than inline SVG or data-URI images — Gmail strips base64-embedded <img> sources
// and doesn't reliably render inline SVG on mobile, so a real hosted image is the most
// broadly compatible option once the backend has a live domain.
const ICON_BASE_URL = 'https://rezoro-express-backend.onrender.com/icons';

// Maps each step's internal icon key to its filename prefix (public/icons uses all-lowercase
// names, e.g. "truckmotion-red.png", while the icon key here stays camelCase for readability).
const ICON_FILE_NAMES = {
  box: 'box',
  tag: 'tag',
  truck: 'truck',
  truckMotion: 'truckmotion',
  check: 'check',
};

function renderIconImg(iconKey, color) {
  const src = `${ICON_BASE_URL}/${ICON_FILE_NAMES[iconKey]}-${color}.png`;
  return `<img src="${src}" width="20" height="20" alt="" style="display:block; width:20px; height:20px; border:0;" />`;
}

// "Complete" steps use a single full-badge image (navy circle + white icon combined,
// transparent corners) instead of a separately-drawn td circle with a small icon inside —
// so no bgcolor/border is needed on the cell for this state.
function renderCompleteBadgeImg(iconKey) {
  const src = `${ICON_BASE_URL}/badge-complete-${ICON_FILE_NAMES[iconKey]}.png`;
  return `<img src="${src}" width="32" height="32" alt="" style="display:block; width:32px; height:32px; border:0;" />`;
}

const STEP_META = [
  { key: 'order_placed', icon: 'box', lines: ['Order', 'placed'] },
  { key: 'picked_up', icon: 'tag', lines: ['Picked', 'up'] },
  { key: 'in_transit', icon: 'truck', lines: ['In', 'transit'] },
  { key: 'out_for_delivery', icon: 'truckMotion', lines: ['Out for', 'delivery'] },
  { key: 'delivered', icon: 'check', lines: ['Delivered', ''] },
];

const STATUS_LABELS = {
  order_placed: 'Order placed',
  picked_up: 'Picked up',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
};

const STATUS_HEADLINES = {
  order_placed: 'Your package has been received.',
  picked_up: 'Your package is on its way.',
  in_transit: 'Your package is on the move.',
  out_for_delivery: 'Your package is almost there.',
  delivered: 'Your package has arrived.',
};

function humanizeStatus(status) {
  if (!status) return 'Unknown';
  return STATUS_LABELS[status] || status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDateLabel(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTimeLabel(date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatEstimate(startISO, endISO) {
  if (!startISO || !endISO) return 'Pending';
  const start = new Date(startISO);
  const end = new Date(endISO);
  const now = new Date();
  const dayLabel = start.toDateString() === now.toDateString() ? 'Today' : formatDateLabel(start);
  return `${dayLabel}, ${formatTimeLabel(start)}–${formatTimeLabel(end)}`;
}

// Mirrors the exact connector-color rule used in styles.css / tracking.html: the
// segment AFTER a given step takes that step's own state color, not the next step's.
function stepState(index, currentIndex) {
  if (currentIndex === -1) return 'upcoming';
  if (index < currentIndex) return 'complete';
  if (index === currentIndex) return 'current';
  return 'upcoming';
}

const STATE_COLORS = {
  complete: { badgeBg: '#0a2344', border: '#0a2344', line: '#0a2344', icon: 'white', labelColor: '#11233a' },
  current: { badgeBg: '#ffffff', border: '#b93425', line: '#b93425', icon: 'red', labelColor: '#b93425' },
  upcoming: { badgeBg: '#ffffff', border: '#bdc8d0', line: '#bdc8d0', icon: 'gray', labelColor: '#4e5f73' },
};

function renderStep(meta, index, currentIndex, isFirst, isLast) {
  const state = stepState(index, currentIndex);
  const colors = STATE_COLORS[state];
  const leftLineColor = isFirst ? '#ffffff' : STATE_COLORS[stepState(index - 1, currentIndex)].line;
  const rightLineColor = isLast ? '#ffffff' : colors.line;
  const [labelTop, labelBottom] = meta.lines;
  const labelHtml = labelBottom ? `${labelTop}<br />${labelBottom}` : labelTop;

  const badgeCell = state === 'complete'
    ? `<td width="32" height="32" align="center" valign="middle" style="width:32px; height:32px; text-align:center; vertical-align:middle;">${renderCompleteBadgeImg(meta.icon)}</td>`
    : `<td width="32" height="32" bgcolor="${colors.badgeBg}" align="center" valign="middle" style="width:32px; height:32px; background-color:${colors.badgeBg}; border:2px solid ${colors.border}; border-radius:16px; text-align:center; vertical-align:middle;">${renderIconImg(meta.icon, colors.icon)}</td>`;

  return `
    <td width="20%" align="center" valign="top">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="39" style="width:39px; height:2px; font-size:0; line-height:0; background-color:${leftLineColor};">&nbsp;</td>
          <td width="32" style="width:32px;">
            <table role="presentation" width="32" cellpadding="0" cellspacing="0" border="0" style="width:32px;">
              <tr>${badgeCell}</tr>
            </table>
          </td>
          <td width="39" style="width:39px; height:2px; font-size:0; line-height:0; background-color:${rightLineColor};">&nbsp;</td>
        </tr>
      </table>
      <p class="step-label" style="margin:9px 0 0; font-family:Arial,Helvetica,sans-serif; font-size:11px; font-weight:700; line-height:14px; color:${colors.labelColor};">${labelHtml}</p>
    </td>`;
}

/**
 * Builds the shipment status update email (subject + HTML body) from real shipment data.
 * Mirrors homepage/email-status-update.html's structure exactly: same header, progress
 * indicator, detail table, CTA button, and footer — just with real values substituted in
 * and the progress indicator computed dynamically for whichever status is current.
 */
function buildStatusUpdateEmail({
  trackingNumber,
  status,
  locationCity,
  locationState,
  estimatedDeliveryStart,
  estimatedDeliveryEnd,
  baseUrl,
}) {
  const statusLabel = humanizeStatus(status);
  const statusLabelLower = statusLabel.toLowerCase();
  const headline = STATUS_HEADLINES[status] || 'Your package status has been updated.';
  const currentIndex = STATUS_STEPS.indexOf(status);
  const estimatedDeliveryText = formatEstimate(estimatedDeliveryStart, estimatedDeliveryEnd);
  const trackingUrl = `${baseUrl}?id=${encodeURIComponent(trackingNumber)}`;
  const lastLocation = locationCity && locationState ? `${locationCity}, ${locationState}` : 'Pending';

  const stepsHtml = STEP_META.map((meta, index) =>
    renderStep(meta, index, currentIndex, index === 0, index === STEP_META.length - 1)
  ).join('');

  const subject = `Your Rezoro Express shipment is ${statusLabelLower}`;

  const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${subject}</title>
<!--[if mso]>
<noscript>
<xml>
<o:OfficeDocumentSettings>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
</noscript>
<![endif]-->
<style>
  body, table, td { font-family: Arial, Helvetica, sans-serif; }
  body { margin: 0 !important; padding: 0 !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table { border-collapse: collapse !important; }
  img { border: 0; line-height: 100%; outline: none; text-decoration: none; }
  a { text-decoration: none; }
  @media screen and (max-width: 600px) {
    .email-container { width: 100% !important; max-width: 100% !important; }
    .stack-padding { padding-left: 20px !important; padding-right: 20px !important; }
    .step-label { font-size: 10px !important; }
    .headline { font-size: 24px !important; }
  }
  /* Gmail dark mode ("dark theme") rewrites background/text colors it doesn't recognize
     as intentionally branded, which is what was flattening the navy header to lavender.
     Gmail (and only Gmail) tags elements it's about to re-theme with data-ogsc/data-ogsb
     attributes, so targeting those selectors lets us re-assert the real header colors
     specifically inside Gmail's dark mode pass. */
  [data-ogsc] .header-bar, [data-ogsc] .header-bar td { background-color: #0a2344 !important; }
  [data-ogsc] .header-wordmark { color: #ffffff !important; }
  [data-ogsc] .header-accent, [data-ogsc] .header-accent-bar { color: #ff8a73 !important; background-color: #ff8a73 !important; }
</style>
</head>
<body style="margin:0; padding:0; background-color:#f7f8f6;" bgcolor="#f7f8f6" x-apple-data-detectors="false">

  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#f7f8f6;">
    Your package ${trackingNumber} is ${statusLabelLower} and estimated to arrive ${estimatedDeliveryText}.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f7f8f6;">
    <tr>
      <td align="center" style="padding:24px 12px;">

        <!--[if mso]>
        <table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td>
        <![endif]-->
        <table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; margin:0 auto; background-color:#ffffff;">

          <tr>
            <td align="center" bgcolor="#0a2344" class="header-bar" style="background-color:#0a2344; padding:28px 25px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle" style="padding-right:10px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="5" class="header-accent-bar" style="width:5px; height:9px; background-color:#ff8a73; font-size:0; line-height:0;">&nbsp;</td>
                        <td width="2" style="width:2px; font-size:0; line-height:0;">&nbsp;</td>
                        <td width="5" valign="bottom" class="header-accent-bar" style="width:5px; height:15px; background-color:#ff8a73; font-size:0; line-height:0;">&nbsp;</td>
                        <td width="2" style="width:2px; font-size:0; line-height:0;">&nbsp;</td>
                        <td width="5" valign="bottom" class="header-accent-bar" style="width:5px; height:21px; background-color:#ff8a73; font-size:0; line-height:0;">&nbsp;</td>
                      </tr>
                    </table>
                  </td>
                  <td valign="middle">
                    <span class="header-wordmark" style="font-family:Arial,Helvetica,sans-serif; font-size:19px; font-weight:800; letter-spacing:-0.02em; color:#ffffff;">rezoro<span class="header-accent" style="color:#ff8a73;">express</span></span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Animated route banner: a small looping GIF (own line-art style, matching the
               truck/route icons used throughout — not modeled on any third-party courier's
               illustration). Static GIF first-frame fallback is the same truck-on-a-route
               art, so clients that don't animate GIFs still show something sensible. -->
          <tr>
            <td align="center" style="padding:20px 25px 0; background-color:#ffffff;">
              <img src="https://rezoro-express-backend.onrender.com/icons/truck-loop.gif" width="300" height="100" alt="" style="display:block; width:300px; height:100px; max-width:100%; border:0;" />
            </td>
          </tr>

          <tr>
            <td class="stack-padding" style="padding:18px 25px 0; font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:19px; color:#4e5f73; border-bottom:1px solid #d8dde2; padding-bottom:18px;">
              Summary: Shipment ${trackingNumber} is <strong style="color:#11233a;">${statusLabelLower}</strong>, last scanned in ${lastLocation}, and is estimated to arrive <strong style="color:#11233a;">${estimatedDeliveryText}</strong>. Track it at the link below.
            </td>
          </tr>

          <tr>
            <td class="stack-padding" style="padding:30px 25px 6px;">
              <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:11px; font-weight:800; letter-spacing:0.12em; text-transform:uppercase; color:#b93425;">Shipment update</p>
              <h1 class="headline" style="margin:8px 0 0; font-family:Georgia,'Times New Roman',serif; font-weight:400; font-size:30px; line-height:1.15; letter-spacing:-0.02em; color:#11233a;">${headline}</h1>
              <p style="margin:10px 0 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:22px; color:#4e5f73;">Tracking number <strong style="color:#11233a; letter-spacing:0.04em;">${trackingNumber}</strong></p>
            </td>
          </tr>

          <tr>
            <td class="stack-padding" style="padding:26px 25px 6px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>${stepsHtml}
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="stack-padding" style="padding:30px 25px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #d8dde2;">
                <tr>
                  <td style="padding:16px 0; border-bottom:1px solid #d8dde2; font-family:Arial,Helvetica,sans-serif;">
                    <p style="margin:0; font-size:11px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:#4e5f73;">Current status</p>
                    <p style="margin:4px 0 0; font-size:16px; font-weight:800; color:#b93425;">${statusLabel}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 0; border-bottom:1px solid #d8dde2; font-family:Arial,Helvetica,sans-serif;">
                    <p style="margin:0; font-size:11px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:#4e5f73;">Last location</p>
                    <p style="margin:4px 0 0; font-size:16px; font-weight:750; color:#11233a;">${lastLocation}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 0; font-family:Arial,Helvetica,sans-serif;">
                    <p style="margin:0; font-size:11px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:#4e5f73;">Estimated delivery</p>
                    <p style="margin:4px 0 0; font-size:16px; font-weight:750; color:#11233a;">${estimatedDeliveryText}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td align="center" class="stack-padding" style="padding:6px 25px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="#b93425" style="background-color:#b93425; border-radius:3px;">
                    <a href="${trackingUrl}" target="_blank" style="display:inline-block; padding:15px 34px; font-family:Arial,Helvetica,sans-serif; font-size:16px; font-weight:800; color:#ffffff; text-decoration:none; border-radius:3px;">Track your package →</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="stack-padding" style="padding:28px 25px; background-color:#f7f8f6; border-top:1px solid #d8dde2;">
              <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:14px; font-weight:800; letter-spacing:-0.02em; color:#0a2344;">rezoro<span style="color:#b93425;">express</span></p>
              <p style="margin:8px 0 0; font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; color:#4e5f73;">Practical shipping for people who need packages to arrive as promised.</p>
              <p style="margin:16px 0 0; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:17px; color:#4e5f73;">
                You're receiving this email because you have an active shipment with Rezoro Express.<br />
                <a href="#" style="color:#4e5f73; text-decoration:underline;">Unsubscribe from shipment emails</a> &nbsp;·&nbsp; <a href="mailto:support@rezoroexpress.com" style="color:#4e5f73; text-decoration:underline;">support@rezoroexpress.com</a>
              </p>
              <p style="margin:14px 0 0; font-family:Arial,Helvetica,sans-serif; font-size:11px; color:#8b98a6;">© 2026 Rezoro Express, Reno, NV</p>
            </td>
          </tr>

        </table>
        <!--[if mso]>
        </td></tr></table>
        <![endif]-->

      </td>
    </tr>
  </table>

</body>
</html>`;

  return { subject, html };
}

module.exports = { buildStatusUpdateEmail, humanizeStatus, formatEstimate, STATUS_STEPS };
