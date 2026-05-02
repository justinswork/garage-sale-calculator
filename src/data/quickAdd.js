import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { shortId } from '../utils/id.js';

function col(eventId) {
  return collection(db, 'events', eventId, 'quickAddItems');
}

export function watchQuickAdds(eventId, cb) {
  const q = query(col(eventId), orderBy('lastUsedAt', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function upsertQuickAdd(eventId, { name, defaultPrice, defaultHostId }) {
  const id = shortId(8);
  await setDoc(doc(col(eventId), id), {
    name: name.trim(),
    defaultPrice,
    defaultHostId: defaultHostId || null,
    lastUsedAt: serverTimestamp()
  });
  return id;
}

export async function touchQuickAdd(eventId, itemId) {
  await updateDoc(doc(col(eventId), itemId), { lastUsedAt: serverTimestamp() });
}

export async function removeQuickAdd(eventId, itemId) {
  await deleteDoc(doc(col(eventId), itemId));
}
