const { Resend } = require('resend');
const { buildStatusUpdateEmail } = require('./emailTemplate');

const FROM_ADDRESS = 'Rezoro Express <onboard@express.rezoro.pro>';
const TRACKING_BASE_URL = 'https://express.rezoro.pro/tracking.html';

if (!process.env.RESEND_API_KEY) {
  console.warn('Warning: RESEND_API_KEY is not set. Set it in backend/.env before scan-event emails can send.');
}

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Sends a shipment status update email. Never throws — callers should treat email
 * delivery as best-effort and continue regardless of the outcome. Returns
 * { success: true } on success, or { success: false, error } if sending failed.
 */
async function sendShipmentStatusEmail({
  to,
  trackingNumber,
  status,
  locationCity,
  locationState,
  estimatedDeliveryStart,
  estimatedDeliveryEnd,
}) {
  try {
    const { subject, html } = buildStatusUpdateEmail({
      trackingNumber,
      status,
      locationCity,
      locationState,
      estimatedDeliveryStart,
      estimatedDeliveryEnd,
      baseUrl: TRACKING_BASE_URL,
    });

    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject,
      html,
    });

    if (result.error) {
      return { success: false, error: result.error.message || String(result.error) };
    }

    return { success: true, id: result.data && result.data.id };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
}

module.exports = { sendShipmentStatusEmail };
