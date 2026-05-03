import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  runTransaction
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { shortId } from '../utils/id.js';

function salesCol(eventId) {
  return collection(db, 'events', eventId, 'sales');
}

export function watchSales(eventId, cb) {
  const q = query(salesCol(eventId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export function watchSale(eventId, saleId, cb) {
  return onSnapshot(doc(salesCol(eventId), saleId), (snap) => {
    if (!snap.exists()) cb(null);
    else cb({ id: snap.id, ...snap.data() });
  });
}

export async function createSale(eventId, { uid, hostId }) {
  const id = shortId(10);
  await setDoc(doc(salesCol(eventId), id), {
    enteredByHostId: hostId,
    enteredByUid: uid,
    status: 'draft',
    items: [],
    itemsSubtotal: 0,
    overrideTotal: null,
    discountAllocation: null,
    cashReceived: null,
    changeGiven: null,
    cashAmount: null,
    digitalAmount: null,
    paymentMethod: 'cash',
    digitalRecipientHostId: null,
    notes: '',
    createdAt: serverTimestamp(),
    completedAt: null,
    deletedAt: null,
    deletedBy: null
  });
  return id;
}

export async function updateSale(eventId, saleId, patch) {
  await updateDoc(doc(salesCol(eventId), saleId), patch);
}

export async function completeSale(eventId, saleId, patch) {
  const status = patch.status || 'completed';
  const data = { ...patch, status };
  if (status !== 'draft') {
    data.completedAt = serverTimestamp();
  }
  await updateDoc(doc(salesCol(eventId), saleId), data);
}

export async function softDeleteSale(eventId, saleId, { hostId }) {
  await updateDoc(doc(salesCol(eventId), saleId), {
    deletedAt: serverTimestamp(),
    deletedBy: hostId
  });
}

export async function restoreSale(eventId, saleId) {
  await updateDoc(doc(salesCol(eventId), saleId), {
    deletedAt: null,
    deletedBy: null
  });
}

export async function hardDeleteDraft(eventId, saleId) {
  await deleteDoc(doc(salesCol(eventId), saleId));
}

// ─── Edit-mode lock ──────────────────────────────────────────────
// editingByHostId + editingAt fields on the sale doc act as a soft lock.
// Heartbeat refreshes the timestamp; release clears the fields. Locks older
// than the timeout (handled at read time) are treated as abandoned.

export async function refreshEditLock(eventId, saleId, { hostId }) {
  await updateDoc(doc(salesCol(eventId), saleId), {
    editingByHostId: hostId,
    editingAt: serverTimestamp()
  });
}

// Atomic release: only clear the lock if we still hold it (avoids
// clobbering another host who took over while we were navigating away).
export async function releaseEditLock(eventId, saleId, { hostId }) {
  const ref = doc(salesCol(eventId), saleId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    if (snap.data().editingByHostId !== hostId) return;
    tx.update(ref, { editingByHostId: null, editingAt: null });
  });
}
