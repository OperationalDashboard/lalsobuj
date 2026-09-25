const express = require('express');
const { requireAuth, requireFeaturePermission } = require('../middleware/auth');
const router = express.Router();
router.use(requireAuth, requireFeaturePermission('online_accounts', 'read'));
// Compatibility for older clients. External OCR is permanently disabled here,
// even if a previous deployment left provider environment variables set.
router.get('/status', (req, res) => res.json({ enabled: false, provider: null, localOnly: true, requiresConsent: false }));
router.post('/read', requireFeaturePermission('online_accounts', 'write'), (req, res) => {
  res.status(410).json({ error: 'External handwriting reading has been removed. Refresh the website and use the on-device reader or manual entry. No document was sent to a provider.' });
});
module.exports = router;
