const express = require('express');
const { requireAdminAuth, handleLogin, handleLogout } = require('./adminAuth');
const {
  renderLoginPage,
  renderDashboard,
  renderNewShipmentForm,
  renderEditShipmentForm,
  renderShipmentDetail,
} = require('./adminViews');
const shipmentService = require('./shipmentService');

const router = express.Router();

function popFlash(req) {
  const flash = req.session.flash;
  delete req.session.flash;
  return flash;
}

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

// --- Auth ---

router.get('/login', (req, res) => {
  if (req.session && req.session.isAdmin) return res.redirect('/admin');
  res.send(renderLoginPage());
});
router.post('/login', handleLogin);
router.post('/logout', handleLogout);

// Everything below requires an authenticated session.
router.use(requireAdminAuth);

// --- Dashboard ---

router.get('/', async (req, res) => {
  try {
    const { q, status } = req.query;
    const shipments = await shipmentService.listShipments({ q, status });
    res.send(renderDashboard({ shipments, q, status, flash: popFlash(req) }));
  } catch (err) {
    console.error('Error loading admin dashboard:', err);
    res.status(500).send('Something went wrong loading the dashboard.');
  }
});

// --- Create shipment ---

router.get('/shipments/new', (req, res) => {
  res.send(renderNewShipmentForm());
});

router.post('/shipments/new', async (req, res) => {
  try {
    const result = await shipmentService.createShipment(req.body);
    if (!result.ok) {
      return res.status(400).send(renderNewShipmentForm({ error: result.error, formData: req.body }));
    }
    setFlash(req, 'success', `Shipment ${result.shipment.tracking_number} created.`);
    res.redirect(`/admin/shipments/${encodeURIComponent(result.shipment.tracking_number)}`);
  } catch (err) {
    console.error('Error creating shipment:', err);
    res.status(500).send(renderNewShipmentForm({ error: 'Something went wrong creating this shipment.', formData: req.body }));
  }
});

// --- Shipment detail ---

router.get('/shipments/:trackingNumber', async (req, res) => {
  try {
    const record = await shipmentService.getShipmentByTrackingNumber(req.params.trackingNumber);
    if (!record) return res.status(404).send('No shipment found with that tracking number.');
    res.send(renderShipmentDetail({ ...record, flash: popFlash(req) }));
  } catch (err) {
    console.error('Error loading shipment detail:', err);
    res.status(500).send('Something went wrong loading this shipment.');
  }
});

// --- Add scan event (reuses shipmentService.recordScanEvent — same logic as the public API) ---

router.post('/shipments/:trackingNumber/scan', async (req, res) => {
  const { trackingNumber } = req.params;
  try {
    const result = await shipmentService.recordScanEvent({
      trackingNumber,
      status: req.body.status,
      locationCity: req.body.location_city,
      locationState: req.body.location_state,
    });

    if (!result.ok) {
      setFlash(req, 'error', result.error);
    } else {
      setFlash(req, 'success', `Scan event recorded. Status update email ${result.emailSent ? 'sent' : 'failed to send (see server logs)'}.`);
    }
  } catch (err) {
    console.error('Error submitting scan event from admin:', err);
    setFlash(req, 'error', 'Something went wrong recording this scan event.');
  }
  res.redirect(`/admin/shipments/${encodeURIComponent(trackingNumber)}`);
});

// --- Manual resend email ---

router.post('/shipments/:trackingNumber/resend-email', async (req, res) => {
  const { trackingNumber } = req.params;
  try {
    const result = await shipmentService.resendStatusEmail(trackingNumber);
    setFlash(req, result.ok ? 'success' : 'error', result.ok ? 'Status email resent.' : result.error);
  } catch (err) {
    console.error('Error resending status email from admin:', err);
    setFlash(req, 'error', 'Something went wrong resending this email.');
  }
  res.redirect(`/admin/shipments/${encodeURIComponent(trackingNumber)}`);
});

// --- Edit shipment ---

router.get('/shipments/:trackingNumber/edit', async (req, res) => {
  try {
    const record = await shipmentService.getShipmentByTrackingNumber(req.params.trackingNumber);
    if (!record) return res.status(404).send('No shipment found with that tracking number.');
    res.send(renderEditShipmentForm({ shipment: record.shipment }));
  } catch (err) {
    console.error('Error loading shipment edit form:', err);
    res.status(500).send('Something went wrong loading this shipment.');
  }
});

router.post('/shipments/:trackingNumber/edit', async (req, res) => {
  const { trackingNumber } = req.params;
  try {
    const result = await shipmentService.updateShipmentDetails(trackingNumber, req.body);
    if (!result.ok) {
      if (result.notFound) return res.status(404).send('No shipment found with that tracking number.');
      return res.status(400).send(renderEditShipmentForm({
        shipment: { ...req.body, tracking_number: trackingNumber },
        error: result.error,
      }));
    }
    setFlash(req, 'success', 'Shipment details updated.');
    res.redirect(`/admin/shipments/${encodeURIComponent(trackingNumber)}`);
  } catch (err) {
    console.error('Error updating shipment:', err);
    res.status(500).send(renderEditShipmentForm({
      shipment: { ...req.body, tracking_number: trackingNumber },
      error: 'Something went wrong saving these changes.',
    }));
  }
});

module.exports = router;
