require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { sendShipmentStatusEmail } = require('./mailer');
const { STATUS_STEPS } = require('./emailTemplate');

const app = express();
const port = process.env.PORT || 4000;
const VALID_STATUSES = new Set(STATUS_STEPS);

if (!process.env.DATABASE_URL) {
  console.warn('Warning: DATABASE_URL is not set. Set it in backend/.env before calling /api/track.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle Postgres client:', err);
});

app.use(cors());
app.use(express.json());
app.use('/icons', express.static(path.join(__dirname, 'public', 'icons')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Assumes: shipments(id, tracking_number, ..., origin_lat, origin_lng,
// destination_lat, destination_lng, current_lat, current_lng) and
// scan_events(id, shipment_id references shipments.id, occurred_at, ...).
// Adjust the column names below if your Neon schema differs.
app.get('/api/track/:trackingNumber', async (req, res) => {
  const { trackingNumber } = req.params;

  try {
    const shipmentResult = await pool.query(
      `SELECT id, tracking_number, status,
              origin_city, origin_state, origin_lat, origin_lng,
              destination_city, destination_state, destination_lat, destination_lng,
              current_lat, current_lng,
              estimated_delivery_start, estimated_delivery_end,
              recipient_email, service_type, created_at, updated_at
       FROM shipments
       WHERE tracking_number = $1`,
      [trackingNumber]
    );

    if (shipmentResult.rows.length === 0) {
      return res.status(404).json({
        error: `No shipment found for tracking number "${trackingNumber}".`,
      });
    }

    const shipment = shipmentResult.rows[0];

    const scanEventsResult = await pool.query(
      'SELECT * FROM scan_events WHERE shipment_id = $1 ORDER BY occurred_at DESC',
      [shipment.id]
    );

    res.json({
      shipment,
      scanEvents: scanEventsResult.rows,
    });
  } catch (err) {
    console.error('Error looking up tracking number:', err);
    res.status(500).json({ error: 'Something went wrong while looking up this shipment.' });
  }
});

// Records a new scan event, updates the shipment's status, and emails the recipient.
// Email delivery is best-effort: the scan event and status update are always saved,
// even if the email fails to send.
app.post('/api/shipments/:trackingNumber/scan', async (req, res) => {
  const { trackingNumber } = req.params;
  const { status, location_city: locationCity, location_state: locationState } = req.body || {};

  if (!status || !locationCity || !locationState) {
    return res.status(400).json({ error: 'status, location_city, and location_state are all required.' });
  }
  if (!VALID_STATUSES.has(status)) {
    return res.status(400).json({
      error: `Invalid status "${status}". Must be one of: ${STATUS_STEPS.join(', ')}.`,
    });
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
      return res.status(404).json({ error: `No shipment found for tracking number "${trackingNumber}".` });
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
       RETURNING id, tracking_number, status,
                 origin_city, origin_state, origin_lat, origin_lng,
                 destination_city, destination_state, destination_lat, destination_lng,
                 current_lat, current_lng,
                 estimated_delivery_start, estimated_delivery_end,
                 recipient_email, service_type, created_at, updated_at`,
      [status, shipmentId]
    );
    shipment = updateResult.rows[0];

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error recording scan event:', err);
    return res.status(500).json({ error: 'Something went wrong while recording this scan event.' });
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

  res.json({ shipment, scanEvent: { ...scanEvent, email_sent: emailSent }, emailSent });
});

app.listen(port, () => {
  console.log(`Rezoro Express backend listening on port ${port}`);
});
