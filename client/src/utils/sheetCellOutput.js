import { strictJourneyDate } from './handwritingOutput.js';
const latin = value => String(value ?? '').replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d)).trim();

// Never fix OCR glyphs, borrow heading dates or use bus lists to guess digits.
export function normalizeSheetCells(cells) {
  const [dateCell, busCell, totalCell] = cells;
  const date = strictJourneyDate(latin(dateCell?.text));
  const rawBus = latin(busCell?.text), rawTotal = latin(totalCell?.text);
  const bus = /^\d{4}$/.test(rawBus) ? rawBus : '';
  const passengers = /^\d{1,5}$/.test(rawTotal) ? String(Number(rawTotal)) : '';
  return { date, bus, passengers, needsReview: true,
    complete: Boolean(date && bus && passengers !== ''),
    issues: [!date && 'Journey date unreadable', !bus && 'Bus number unreadable', passengers === '' && 'Passenger count unreadable', 'Unverified OCR: confirm against the original'].filter(Boolean) };
}
