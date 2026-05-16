import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  collection,
  writeBatch
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { shortId } from '../utils/id.js';

export async function createEvent({ name, uid }) {
  const id = shortId(12);
  await setDoc(doc(db, 'events', id), {
    name: name || 'Garage Sale',
    createdAt: serverTimestamp(),
    createdByUid: uid,
    status: 'open'
  });
  return id;
}

export async function getEvent(eventId) {
  const snap = await getDoc(doc(db, 'events', eventId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export function watchEvent(eventId, cb) {
  return onSnapshot(doc(db, 'events', eventId), (snap) => {
    if (!snap.exists()) cb(null);
    else cb({ id: snap.id, ...snap.data() });
  });
}

export async function renameEvent(eventId, name) {
  await updateDoc(doc(db, 'events', eventId), { name });
}

export async function setEventStatus(eventId, status) {
  await updateDoc(doc(db, 'events', eventId), { status });
}

// AI features (photo-to-price helper). Defaults to ON when the field is
// absent — events created before this flag existed should keep working.
export async function setAiFeaturesEnabled(eventId, enabled) {
  await updateDoc(doc(db, 'events', eventId), { aiFeaturesEnabled: enabled });
}

// Update one or more event detail fields (startDate, endDate, location, notes).
// Pass null to clear a field. Caller is responsible for audit logging.
export async function updateEventDetails(eventId, patch) {
  await updateDoc(doc(db, 'events', eventId), patch);
}

export async function setDailyStartingCash(eventId, dayKey, cents) {
  await updateDoc(doc(db, 'events', eventId), {
    [`dailyStartingCash.${dayKey}`]: cents
  });
}

export async function clearDailyStartingCash(eventId, dayKey) {
  await updateDoc(doc(db, 'events', eventId), {
    [`dailyStartingCash.${dayKey}`]: null
  });
}

// Hard delete an event and ALL its subcollection docs. Only the event's
// original creator is allowed by Firestore rules. Used for cleaning up
// test events; not recoverable.
export async function deleteEvent(eventId) {
  const subcollections = ['hosts', 'sales', 'settlements', 'quickAddItems', 'audit'];
  for (const sub of subcollections) {
    const colRef = collection(db, 'events', eventId, sub);
    const snap = await getDocs(colRef);
    if (snap.empty) continue;
    // Firestore caps writeBatch at 500 ops, so chunk if needed.
    const chunks = [];
    for (let i = 0; i < snap.docs.length; i += 450) {
      chunks.push(snap.docs.slice(i, i + 450));
    }
    for (const chunk of chunks) {
      const batch = writeBatch(db);
      for (const d of chunk) batch.delete(d.ref);
      await batch.commit();
    }
  }
  await deleteDoc(doc(db, 'events', eventId));
}
