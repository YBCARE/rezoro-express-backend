const crypto = require('crypto');
const { pool } = require('./db');
const { sendShipmentStatusEmail } = require('./mailer');
const { STATUS_STEPS } = require('./emailTemplate');

const VALID_STATUSES = new Set(STATUS_STEPS);

const SHIPMENT_COLUMNS = `
  id, tracking_number, status,
  origin_city, origin_state, origin_lat, origin_lng,
  destination_city, destination_state, destination_lat, destination_lng,
  current_lat, current_lng,
  estimated_delivery_start, estimated_delivery_end,
  recipient_email, service_type, created_at, updated_at
`;

async function generateUniqueTrackingNumber(client) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const digits = crypto.randomInt(0, 1_000_000_000).toString().padStart(9, '0');
    const candidate = `RZX${digits}`;
    const existing = await client.query('SELECT 1 FROM shipments WHERE tracking_number = $1', [candidate]);
    if (existing.rows.length === 0) return candidate;
  }
  throw new Error('Could not generate a unique tracking number after 10 attempts.');
}

async function listShipments({ q, status } = {}) {
  const conditions = [];
  const params = [];

  if (q && q.trim()) {
    params.push(`%${q.trim()}%`);
    conditions.push(`(tracking_number ILIKE $${params.length} OR recipient_email ILIKE $${params.length})`);
  }
  if (status && VALID_STATUSES.has(status)) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT ${SHIPMENT_COLUMNS} FROM shipments ${whereClause} ORDER BY updated_at DESC`,
    params
  );
  return result.rows;
}

async function getShipmentByTrackingNumber(trackingNumber) {
  const shipmentResult = await pool.query(
    `SELECT ${SHIPMENT_COLUMNS} FROM shipments WHERE tracking_number = $1`,
    [trackingNumber]
  );
  if (shipmentResult.rows.length === 0) return null;

  const shipment = shipmentResult.rows[0];
  const scanEventsResult = await pool.query(
    'SELECT * FROM scan_events WHERE shipment_id = $1 ORDER BY occurred_at DESC',
    [shipment.id]
  );
  return { shipment, scanEvents: scanEventsResult.rows };
}

function validateShipmentInput(data, { requireAll }) {
  const required = [
    'origin_city', 'origin_state', 'origin_lat', 'origin_lng',
    'destination_city', 'destination_state', 'destination_lat', 'destination_lng',
    'recipient_email', 'service_type',
    'estimated_delivery_start', 'estimated_delivery_end',
  ];
  if (requireAll) {
    const missing = required.filter((field) => data[field] === undefined || data[field] === null || data[field] === '');
    if (missing.length > 0) {
      return `Missing required field(s): ${missing.join(', ')}.`;
    }
  }
  const numericFields = ['origin_lat', 'origin_lng', 'destination_lat', 'destination_lng'];
  for (const field of numericFields) {
    if (data[field] !== undefined && data[field] !== null && data[field] !== '' && Number.isNaN(Number(data[field]))) {
      return `Field "${field}" must be a number.`;
    }
  }
  return null;
}

async function createShipment(data) {
  const validationError = validateShipmentInput(data, { requireAll: true });
  if (validationError) return { ok: false, error: validationError };

  const client = await pool.connect();
  try {
    const trackingNumber = data.tracking_number && data.tracking_number.trim()
      ? data.tracking_number.trim().toUpperCase()
      : await generateUniqueTrackingNumber(client);

    const result = await client.query(
      `INSERT INTO shipments (
         tracking_number, status,
         origin_city, origin_state, origin_lat, origin_lng,
         destination_city, destination_state, destination_lat, destination_lng,
         current_lat, current_lng,
         estimated_delivery_start, estimated_delivery_end,
         recipient_email, service_type, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW()
       )
       RETURNING ${SHIPMENT_COLUMNS}`,
      [
        trackingNumber,
        'order_placed',
        data.origin_city,
        data.origin_state,
        Number(data.origin_lat),
        Number(data.origin_lng),
        data.destination_city,
        data.destination_state,
        Number(data.destination_lat),
        Number(data.destination_lng),
        data.origin_lat !== undefined ? Number(data.origin_lat) : null,
        data.origin_lng !== undefined ? Number(data.origin_lng) : null,
        data.estimated_delivery_start,
        data.estimated_delivery_end,
        data.recipient_email,
        data.service_type,
      ]
    );
    return { ok: true, shipment: result.rows[0] };
  } catch (err) {
    if (err.code === '23505') {
      return { ok: false, error: `Tracking number already exists. Leave it blank to auto-generate one.` };
    }
    throw err;
  } finally {
    client.release();
  }
}

async function updateShipmentDetails(trackingNumber, data) {
  const validationError = validateShipmentInput(data, { requireAll: true });
  if (validationError) return { ok: false, error: validationError };

  const result = await pool.query(
    `UPDATE shipments SET
       origin_city = $1, origin_state = $2, origin_lat = $3, origin_lng = $4,
       destination_city = $5, destination_state = $6, destination_lat = $7, destination_lng = $8,
       estimated_delivery_start = $9, estimated_delivery_end = $10,
       recipient_email = $11, service_type = $12,
       updated_at = NOW()
     WHERE tracking_number = $13
     RETURNING ${SHIPMENT_COLUMNS}`,
    [
      data.origin_city,
      data.origin_state,
      Number(data.origin_lat),
      Number(data.origin_lng),
      data.destination_city,
      data.destination_state,
      Number(data.destination_lat),
      Number(data.destination_lng),
      data.estimated_delivery_start,
      data.estimated_delivery_end,
      data.recipient_email,
      data.service_type,
      trackingNumber,
    ]
  );

  if (result.rows.length === 0) return { ok: false, error: `No shipment found for tracking number "${trackingNumber}".`, notFound: true };
  return { ok: true, shipment: result.rows[0] };
}

/**
 * Records a new scan event, updates the shipment's status, and emails the recipient.
 * Shared by the public POST /api/shipments/:trackingNumber/scan route and the admin UI's
 * scan-event form, so both go through identical DB + email behavior.
 *
 * Email delivery is best-effort: the scan event and status update are always saved, even if
 * the email fails to send. Returns a result object rather than throwing for expected failure
 * cases (missing fields, invalid status, unknown tracking number) so callers can render
 * either a JSON error response or an HTML flash message as appropriate.
 */
async function recordScanEvent({ trackingNumber, status, locationCity, locationState }) {
  if (!status || !locationCity || !locationState) {
    return { ok: false, statusCode: 400, error: 'status, location_city, and location_state are all required.' };
  }
  if (!VALID_STATUSES.has(status)) {
    return {
      ok: false,
      statusCode: 400,
      error: `Invalid status "${status}". Must be one of: ${STATUS_STEPS.join(', ')}.`,
    };
  }

  const client = await pool.connect();
  let shipment;
  let scanEvent;

  try {
    await client.query('BEGIN');

    const shipmentResult = await client.query(
      'SELECT id FROM shipments WHERE tracking_number = $1 FOR UPDATE',
      [trackingNumber]
    );

    if (shipmentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, statusCode: 404, error: `No shipment found for tracking number "${trackingNumber}".` };
    }

    const shipmentId = shipmentResult.rows[0].id;

    const scanResult = await client.query(
      `INSERT INTO scan_events (shipment_id, status, location_city, location_state, occurred_at, email_sent)
       VALUES ($1, $2, $3, $4, NOW(), false)
       RETURNING *`,
      [shipmentId, status, locationCity, locationState]
    );
    scanEvent = scanResult.rows[0];

    const updateResult = await client.query(
      `UPDATE shipments SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING ${SHIPMENT_COLUMNS}`,
      [status, shipmentId]
    );
    shipment = updateResult.rows[0];

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error recording scan event:', err);
    return { ok: false, statusCode: 500, error: 'Something went wrong while recording this scan event.' };
  } finally {
    client.release();
  }

  let emailSent = false;
  try {
    const emailResult = await sendShipmentStatusEmail({
      to: shipment.recipient_email,
      trackingNumber: shipment.tracking_number,
      status: shipment.status,
      locationCity,
      locationState,
      estimatedDeliveryStart: shipment.estimated_delivery_start,
      estimatedDeliveryEnd: shipment.estimated_delivery_end,
    });

    if (emailResult.success) {
      emailSent = true;
      await pool.query('UPDATE scan_events SET email_sent = true WHERE id = $1', [scanEvent.id]);
    } else {
      console.error(`Failed to send status email for shipment ${trackingNumber}:`, emailResult.error);
    }
  } catch (err) {
    console.error(`Unexpected error sending status email for shipment ${trackingNumber}:`, err);
  }

  return { ok: true, shipment, scanEvent: { ...scanEvent, email_sent: emailSent }, emailSent };
}

/**
 * Re-sends the status update email for a shipment's current status, without creating a
 * new scan event. Uses the most recent scan event's location (if any) as the location shown
 * in the email, since that's what the last real status-update email would have shown.
 */
async function resendStatusEmail(trackingNumber) {
  const record = await getShipmentByTrackingNumber(trackingNumber);
  if (!record) return { ok: false, statusCode: 404, error: `No shipment found for tracking number "${trackingNumber}".` };

  const { shipment, scanEvents } = record;
  const latestScan = scanEvents[0];

  const emailResult = await sendShipmentStatusEmail({
    to: shipment.recipient_email,
    trackingNumber: shipment.tracking_number,
    status: shipment.status,
    locationCity: latestScan ? latestScan.location_city : null,
    locationState: latestScan ? latestScan.location_state : null,
    estimatedDeliveryStart: shipment.estimated_delivery_start,
    estimatedDeliveryEnd: shipment.estimated_delivery_end,
  });

  if (!emailResult.success) {
    return { ok: false, statusCode: 502, error: `Failed to send email: ${emailResult.error}` };
  }
  return { ok: true, shipment };
}

module.exports = {
  VALID_STATUSES,
  listShipments,
  getShipmentByTrackingNumber,
  createShipment,
  updateShipmentDetails,
  recordScanEvent,
  resendStatusEmail,
};
