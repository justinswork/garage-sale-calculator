import {
  collection,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  query,
  orderBy
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { shortId } from '../utils/id.js';

function hostsCol(eventId) {
  return collection(db, 'events', eventId, 'hosts');
}

export function watchHosts(eventId, cb) {
  const q = query(hostsCol(eventId), orderBy('joinedAt', 'asc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function addHost(eventId, { name, uid }) {
  const id = shortId(8);
  await setDoc(doc(hostsCol(eventId), id), {
    name: name.trim(),
    joinedAt: serverTimestamp(),
    deviceUids: [uid]
  });
  return id;
}

export async function attachDeviceToHost(eventId, hostId, uid) {
  await updateDoc(doc(hostsCol(eventId), hostId), {
    deviceUids: arrayUnion(uid)
  });
}

export async function renameHost(eventId, hostId, name) {
  await updateDoc(doc(hostsCol(eventId), hostId), { name: name.trim() });
}
