import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp
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
