require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const shipmentService = require('./shipmentService');
const { configureSession } = require('./adminAuth');
const adminRoutes = require('./adminRoutes');

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/icons', express.static(path.join(__dirname, 'public', 'icons')));

configureSession(app);
app.use('/admin', adminRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/track/:trackingNumber', async (req, res) => {
  const { trackingNumber } = req.params;

  try {
    const record = await shipmentService.getShipmentByTrackingNumber(trackingNumber);

    if (!record) {
      return res.status(404).json({
        error: `No shipment found for tracking number "${trackingNumber}".`,
      });
    }

    res.json({ shipment: record.shipment, scanEvents: record.scanEvents });
  } catch (err) {
    console.error('Error looking up tracking number:', err);
    res.status(500).json({ error: 'Something went wrong while looking up this shipment.' });
  }
});

// Records a new scan event, updates the shipment's status, and emails the recipient.
// Email delivery is best-effort: the scan event and status update are always saved,
// even if the email fails to send. Shared with the admin UI via shipmentService.
app.post('/api/shipments/:trackingNumber/scan', async (req, res) => {
  const { trackingNumber } = req.params;
  const { status, location_city: locationCity, location_state: locationState } = req.body || {};

  const result = await shipmentService.recordScanEvent({ trackingNumber, status, locationCity, locationState });

  if (!result.ok) {
    return res.status(result.statusCode).json({ error: result.error });
  }

  res.json({ shipment: result.shipment, scanEvent: result.scanEvent, emailSent: result.emailSent });
});

app.listen(port, () => {
  console.log(`Rezoro Express backend listening on port ${port}`);
});
