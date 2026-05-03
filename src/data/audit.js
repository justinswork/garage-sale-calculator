import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  limit
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { shortId } from '../utils/id.js';

function col(eventId) {
  return collection(db, 'events', eventId, 'audit');
}

// Watch the most recent audit entries (newest first). Default cap of 500
// matches a sane garage-sale day; older history is still queryable directly.
export function watchAudit(eventId, cb, max = 500) {
  const q = query(col(eventId), orderBy('at', 'desc'), limit(max));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

// Record one immutable audit entry. Fires-and-forgets — failures are logged
// but don't block the user-facing operation that triggered them.
//
// entry shape: { type, summary, byUid, byHostId, meta }
export function recordAudit(eventId, entry) {
  if (!eventId || !entry?.type) return Promise.resolve();
  const id = shortId(10);
  return setDoc(doc(col(eventId), id), {
    type: entry.type,
    summary: entry.summary || '',
    byUid: entry.byUid || null,
    byHostId: entry.byHostId || null,
    meta: entry.meta || null,
    at: serverTimestamp()
  }).catch((err) => {
    // Audit must never break the foreground action.
    console.warn('[audit] failed to record', entry.type, err);
  });
}
