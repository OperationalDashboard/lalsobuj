const express = require('express');
const { randomUUID } = require('node:crypto');
const db = require('../db');
const { requireRole } = require('../middleware/auth');
const { ROLES } = require('../roles');
const schema = require('../data/bus-anatomy-schema.json');

// Mounted behind settings authentication. Existing bus.model values are names;
// retained aliases keep those operational records linked without rewriting them.
const router = express.Router();
const KEY = 'bus_model_templates';
const defaults = schema.templates.filter(t => !t.id.startsWith('paper-')).map(t => ({
  id: `fleet-model-${t.id}`, name: t.name, aliases: [], templateId: t.id,
  engineLayout: 'rear', archived: false, edits: [],
}));
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
function read() {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(KEY);
  if (!row) return { raw: null, catalog: { revision: 0, models: defaults } };
  let catalog;
  try { catalog = JSON.parse(row.value); } catch { throw fail('Model settings could not be read. Existing settings were not changed.', 500); }
  if (!Number.isSafeInteger(catalog?.revision) || !Array.isArray(catalog.models)) throw fail('Invalid saved model settings. Contact Super Admin.', 500);
  return { raw: row.value, catalog };
}
function cleanText(value, max, name) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw fail(`Enter a valid ${name} (maximum ${max} characters).`);
  return value.trim();
}
function validate(body, existing, models) {
  const name = cleanText(body.name, 100, 'model name');
  if (!schema.templates.some(t => t.id === body.templateId)) throw fail('Choose an available anatomy reference.');
  if (!['front', 'rear', 'double'].includes(body.engineLayout)) throw fail('Choose front, rear or double engine layout.');
  if (body.archived !== undefined && typeof body.archived !== 'boolean') throw fail('Invalid archive status.');
  const id = existing?.id || `fleet-model-${randomUUID()}`;
  const aliases = existing ? [...new Set([...existing.aliases, ...(existing.name !== name ? [existing.name] : [])])] : [];
  if (aliases.length > 100) throw fail('This model has reached its rename limit.');
  const identifiers = [name, ...aliases].map(v => v.toLowerCase());
  if (models.some(m => m.id !== id && [m.name, ...m.aliases].some(v => identifiers.includes(v.toLowerCase())))) throw fail('That model name is already used, including an archived name. Edit or restore the existing model.');
  const edits = body.edits === undefined ? existing?.edits || [] : body.edits;
  if (!Array.isArray(edits) || edits.length > 250) throw fail('Too many component changes.');
  const seen = new Set();
  const normalizedEdits = edits.map(e => {
    if (!e || e.modelId !== id || typeof e.partId !== 'string' || e.partId.length >= 100 || seen.has(e.partId)
      || !schema.systems.includes(e.system) || typeof e.hidden !== 'boolean' || typeof e.custom !== 'boolean'
      || (e.custom ? !/^custom-[a-zA-Z0-9-]+$/.test(e.partId) : !schema.parts.some(p => p.id === e.partId && p.system === e.system))
      || typeof e.note !== 'string' || e.note.length > 1200) throw fail('Invalid component change. Refresh and try again.');
    seen.add(e.partId);
    return { modelId: id, partId: e.partId, system: e.system, name: cleanText(e.name, 90, 'component name'),
      purpose: cleanText(e.purpose, 800, 'component description'), note: e.note.trim(), hidden: e.hidden,
      custom: e.custom, updatedAt: new Date().toISOString() };
  });
  return { id, name, aliases, templateId: body.templateId, engineLayout: body.engineLayout,
    archived: body.archived ?? existing?.archived ?? false, edits: normalizedEdits };
}
function persist(snapshot, models) {
  const catalog = { revision: snapshot.catalog.revision + 1, models };
  // One conditional write works with the remote libSQL replica. No synchronous
  // transaction wrapper, and stale clients cannot overwrite a newer catalog.
  const result = db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at WHERE settings.value = ?`)
    .run(KEY, JSON.stringify(catalog), snapshot.raw);
  if (Number(result.changes) !== 1) throw fail('Model settings changed in another session. Refresh before saving again.', 409);
  return catalog;
}
router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
router.get('/', (req, res, next) => { try { res.json(read().catalog); } catch (e) { next(e); } });
router.use(requireRole(ROLES.SUPER_ADMIN));
router.post('/', (req, res, next) => {
  try {
    const snapshot = read();
    if (req.body.revision !== snapshot.catalog.revision) throw fail('Model settings changed. Refresh before saving again.', 409);
    if (snapshot.catalog.models.length >= 500) throw fail('Model limit reached. Edit an existing model.');
    const model = validate(req.body, null, snapshot.catalog.models);
    res.status(201).json(persist(snapshot, [...snapshot.catalog.models, model]));
  } catch (e) { next(e); }
});
router.put('/:id', (req, res, next) => {
  try {
    const snapshot = read();
    if (req.body.revision !== snapshot.catalog.revision) throw fail('Model settings changed. Refresh before saving again.', 409);
    const existing = snapshot.catalog.models.find(m => m.id === req.params.id);
    if (!existing) throw fail('Model not found.', 404);
    const model = validate(req.body, existing, snapshot.catalog.models);
    res.json(persist(snapshot, snapshot.catalog.models.map(m => m.id === model.id ? model : m)));
  } catch (e) { next(e); }
});
router.use((err, req, res, next) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error('Bus model settings could not be saved:', err.message);
  res.status(503).json({ error: 'The database is temporarily unavailable. Your model changes were not saved; please try again.' });
});
module.exports = router;
