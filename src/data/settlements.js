import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { shortId } from '../utils/id.js';

function col(eventId) {
  return collection(db, 'events', eventId, 'settlements');
}

export function watchSettlements(eventId, cb) {
  const q = query(col(eventId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function recordSettlement(eventId, { from, to, amount, paymentMethod, byUid }) {
  const id = shortId(8);
  await setDoc(doc(col(eventId), id), {
    from,
    to,
    amount,
    paymentMethod: paymentMethod === 'cash' ? 'cash' : 'digital',
    byUid: byUid || null,
    createdAt: serverTimestamp()
  });
  return id;
}

export async function unrecordSettlement(eventId, settlementId) {
  await deleteDoc(doc(col(eventId), settlementId));
}
