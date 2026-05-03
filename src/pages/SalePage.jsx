import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Trash2, Plus, X, Check, AlertTriangle, RotateCcw, Sparkles,
  Pencil, MessageSquarePlus, Tag, Banknote, Smartphone, Wallet, Lock, ChevronLeft, ChevronDown, ArrowRight
} from 'lucide-react';
import { hostColor } from '../utils/colors.js';
import { Link } from 'react-router-dom';
import { useEvent } from '../contexts/EventContext.jsx';
import EventHeader from '../components/EventHeader.jsx';
import Loader from '../components/Loader.jsx';
import {
  watchSale, updateSale, completeSale,
  softDeleteSale, restoreSale, hardDeleteDraft
} from '../data/sales.js';
import { watchQuickAdds, upsertQuickAdd, touchQuickAdd, removeQuickAdd } from '../data/quickAdd.js';
import { recordAudit } from '../data/audit.js';
import HostPill from '../components/HostPill.jsx';
import MoneyInput from '../components/MoneyInput.jsx';
import { formatMoney, parseMoney } from '../utils/money.js';
import {
  itemsSubtotal, perHostFromItems, proportionalAllocation
} from '../utils/sale.js';
import { shortId } from '../utils/id.js';

export default function SalePage() {
  const { eventId, saleId } = useParams();
  const navigate = useNavigate();
  const { event, hosts, currentHost, uid, saleNumberMap } = useEvent();
  const [sale, setSale] = useState(undefined);
  const [quickAdds, setQuickAdds] = useState([]);

  // local working copy
  const [items, setItems] = useState([]);
  const [overrideStr, setOverrideStr] = useState('');
  const [cashStr, setCashStr] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [digitalRecipient, setDigitalRecipient] = useState('');
  const [splitDigitalStr, setSplitDigitalStr] = useState('');

  // progressive-disclosure toggles
  const [showOverride, setShowOverride] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // 2-step flow: rapid item entry then payment
  const [stage, setStage] = useState('items'); // 'items' | 'payment'
  const [rapidPriceStr, setRapidPriceStr] = useState('');
  const rapidPriceRef = useRef(null);

  const overrideInputRef = useRef(null);
  const notesInputRef = useRef(null);

  const handleOpenNegotiate = () => {
    setShowOverride(true);
    requestAnimationFrame(() => {
      overrideInputRef.current?.focus();
      try { overrideInputRef.current?.select(); } catch {}
    });
  };

  const handleOpenNotes = () => {
    setShowNotes(true);
    requestAnimationFrame(() => {
      notesInputRef.current?.focus();
    });
  };

  useEffect(() => {
    let firstLoad = true;
    const unsubSale = watchSale(eventId, saleId, (s) => {
      setSale(s);
      if (s && firstLoad) {
        firstLoad = false;
        setItems(s.items?.length ? s.items : []);
        if (s.overrideTotal != null) {
          setOverrideStr((s.overrideTotal / 100).toFixed(2));
          setShowOverride(true);
        }
        if (s.notes) {
          setNotes(s.notes);
          setShowNotes(true);
        }
        setPaymentMethod(s.paymentMethod || 'cash');
        setDigitalRecipient(s.digitalRecipientHostId || '');
        if (s.paymentMethod === 'split') {
          if (s.cashAmount != null) setCashStr((s.cashAmount / 100).toFixed(2));
          if (s.digitalAmount != null) setSplitDigitalStr((s.digitalAmount / 100).toFixed(2));
        } else if (s.cashReceived != null) {
          setCashStr((s.cashReceived / 100).toFixed(2));
        }
        // Default stage: drafts open at items (rapid entry); pending or
        // completed transactions open at payment for review/resolve.
        setStage(s.status === 'draft' ? 'items' : 'payment');
      }
    });
    const unsubQA = watchQuickAdds(eventId, setQuickAdds);
    return () => {
      unsubSale();
      unsubQA();
    };
  }, [eventId, saleId]);

  const enteredByHost = sale ? hosts.find((h) => h.id === sale.enteredByHostId) : null;
  const subtotal = useMemo(() => itemsSubtotal(items), [items]);
  const overrideTotal = useMemo(() => (overrideStr.trim() ? parseMoney(overrideStr) : null), [overrideStr]);
  const overrideActive = overrideTotal != null && overrideTotal !== subtotal;
  const discount = overrideActive ? subtotal - overrideTotal : 0;
  const perHostFromItemsMap = useMemo(() => perHostFromItems(items), [items]);
  const cashReceived = useMemo(() => (cashStr.trim() ? parseMoney(cashStr) : null), [cashStr]);
  const finalTotal = overrideActive ? overrideTotal : subtotal;
  const change = cashReceived != null ? cashReceived - finalTotal : null;

  const allocation = sale?.discountAllocation ?? null;
  const finalPerHost = useMemo(() => {
    if (!overrideActive || discount <= 0) return perHostFromItemsMap;
    if (allocation === 'proportional') return proportionalAllocation(perHostFromItemsMap, discount);
    if (allocation && typeof allocation === 'object') return allocation;
    return null;
  }, [perHostFromItemsMap, overrideActive, allocation, discount]);

  if (sale === undefined) return <Loader label="Loading transaction…" />;
  if (sale === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <p className="font-semibold mb-2">Transaction not found</p>
        <button className="btn-secondary" onClick={() => navigate(`/e/${eventId}`)}>Back to event</button>
      </div>
    );
  }

  const isDeleted = !!sale.deletedAt;
  const isDraft = sale.status === 'draft';
  const isPendingState = sale.status === 'pending-discount';
  const isCompleted = sale.status === 'completed';
  const eventClosed = event.status === 'closed';
  // Drafts and pending sales use the 2-stage flow with an action bar.
  // Completed sales are still editable (hosts can fill in item details, fix
  // names/qty, adjust cash, etc. after the rush) — but show all sections at
  // once with no Continue/Complete buttons. Deleted or closed = locked.
  const isInProgress = isDraft || isPendingState;
  const editable = !isDeleted && !eventClosed;
  // Money-affecting fields (price, qty, override, cash received, payment
  // method, recipient, allocation) are only editable while the transaction is
  // still in progress. Completed transactions allow only metadata edits
  // (item name, host, notes).
  const moneyEditable = editable && isInProgress;
  const willBePending = overrideActive && discount > 0 && !allocation;
  // Rapid-entry items intentionally have no name — only host + price + qty are required.
  const itemsValid = items.length > 0 && items.every((it) =>
    it.hostId && it.unitPrice > 0 && it.qty > 0);
  const isPureCash = paymentMethod === 'cash';
  const isPureDigital = paymentMethod === 'digital';
  const isSplit = paymentMethod === 'split';
  const splitDigitalAmount = isSplit && splitDigitalStr.trim() ? parseMoney(splitDigitalStr) : null;
  const splitCashAmount = isSplit && cashStr.trim() ? parseMoney(cashStr) : null;
  const splitSum = (splitCashAmount || 0) + (splitDigitalAmount || 0);
  const splitMismatch = isSplit && (splitCashAmount != null && splitDigitalAmount != null) && splitSum !== finalTotal;
  const splitIncomplete = isSplit && (splitCashAmount == null || splitDigitalAmount == null);

  const cashShort = isPureCash && cashReceived != null && cashReceived < finalTotal;
  const cashMissing = isPureCash && cashReceived == null;
  const recipientMissing = (isPureDigital || isSplit) && !digitalRecipient;
  const canSubmit = itemsValid && !cashShort && !splitMismatch;
  // For completed transactions, hold edits in local state and only persist on
  // explicit Save Changes (so Cancel can simply discard local state). Drafts
  // and pending sales still autosave on blur for offline-resilience during
  // the customer rush.
  const deferredSave = editable && !isInProgress;
  const persistSale = (data) => {
    if (deferredSave) return;
    updateSale(eventId, saleId, data).catch(() => {});
  };

  const persistItems = (list) => {
    persistSale({
      items: list,
      itemsSubtotal: itemsSubtotal(list)
    });
  };

  const deleteItem = (id) => {
    const removed = items.find((it) => it.id === id);
    const next = items.filter((it) => it.id !== id);
    setItems(next);
    persistItems(next);
    if (removed && isInProgress) {
      const num = saleNumberMap?.[saleId];
      const removedHost = hosts.find((h) => h.id === removed.hostId);
      const desc = removed.name?.trim() || 'untitled';
      recordAudit(eventId, {
        type: 'transaction.item.removed',
        summary: `Removed ${formatMoney((removed.qty || 1) * (removed.unitPrice || 0))} ${desc}${removedHost ? ` (${removedHost.name})` : ''} from transaction${num ? ` #${num}` : ''}`,
        byUid: uid,
        byHostId: currentHost.id,
        meta: { saleId, item: removed }
      });
    }
  };

  // Apply a partial update to a single item and persist. Used by inline edit.
  const editItem = (id, patch) => {
    const next = items.map((it) => (it.id === id ? { ...it, ...patch } : it));
    setItems(next);
    persistItems(next);
  };

  const addQuickAdd = (qa) => {
    const it = {
      id: shortId(6), name: qa.name, qty: 1,
      unitPrice: qa.defaultPrice, hostId: qa.defaultHostId || currentHost.id,
      saveForQuickAdd: false
    };
    const next = [...items, it];
    setItems(next);
    persistItems(next);
    touchQuickAdd(eventId, qa.id).catch(() => {});
    if (isInProgress) {
      const num = saleNumberMap?.[saleId];
      const itemHost = hosts.find((h) => h.id === it.hostId);
      recordAudit(eventId, {
        type: 'transaction.item.added',
        summary: `Added ${qa.name} ${formatMoney(qa.defaultPrice)}${itemHost ? ` (${itemHost.name})` : ''} to transaction${num ? ` #${num}` : ''} from quick-add`,
        byUid: uid,
        byHostId: currentHost.id,
        meta: { saleId, item: it, fromQuickAdd: qa.id }
      });
    }
  };

  const handleRemoveQuickAdd = async (qa) => {
    if (!confirm(`Remove "${qa.name}" from quick-add?`)) return;
    await removeQuickAdd(eventId, qa.id).catch(() => {});
  };

  // Rapid-entry: type a price, tap a host, item is appended with no name/qty.
  // The host name shows as a colored pill, the input clears, and focus returns.
  const addRapidItem = (hostId) => {
    const price = parseMoney(rapidPriceStr);
    if (price == null || price <= 0) return;
    const it = {
      id: shortId(6),
      name: '',
      qty: 1,
      unitPrice: price,
      hostId,
      saveForQuickAdd: false
    };
    const next = [...items, it];
    setItems(next);
    persistItems(next);
    setRapidPriceStr('');
    setTimeout(() => rapidPriceRef.current?.focus(), 0);
    const num = saleNumberMap?.[saleId];
    const itemHost = hosts.find((h) => h.id === hostId);
    recordAudit(eventId, {
      type: 'transaction.item.added',
      summary: `Added ${formatMoney(price)}${itemHost ? ` (${itemHost.name})` : ''} to transaction${num ? ` #${num}` : ''}`,
      byUid: uid,
      byHostId: currentHost.id,
      meta: { saleId, item: it }
    });
  };

  const persistOverride = () => {
    const cents = overrideStr.trim() ? parseMoney(overrideStr) : null;
    persistSale({
      overrideTotal: cents,
      discountAllocation: cents == null ? null : sale.discountAllocation
    });
  };

  const persistCash = () => {
    const cents = cashStr.trim() ? parseMoney(cashStr) : null;
    persistSale({
      cashReceived: cents,
      changeGiven: cents != null ? cents - finalTotal : null
    });
  };

  const persistNotes = () => persistSale({ notes });
  const setAllocation = (alloc) => persistSale({ discountAllocation: alloc });

  const switchPaymentMethod = (method) => {
    setPaymentMethod(method);
    if (method === 'cash') {
      setDigitalRecipient('');
      setSplitDigitalStr('');
      persistSale({
        paymentMethod: 'cash',
        digitalRecipientHostId: null,
        cashAmount: null,
        digitalAmount: null
      });
    } else if (method === 'digital') {
      const r = digitalRecipient || currentHost.id;
      setDigitalRecipient(r);
      setCashStr('');
      setSplitDigitalStr('');
      persistSale({
        paymentMethod: 'digital',
        digitalRecipientHostId: r,
        cashReceived: null,
        changeGiven: null,
        cashAmount: null,
        digitalAmount: null
      });
    } else { // split
      const r = digitalRecipient || currentHost.id;
      setDigitalRecipient(r);
      setCashStr('');
      setSplitDigitalStr('');
      persistSale({
        paymentMethod: 'split',
        digitalRecipientHostId: r,
        cashReceived: null,
        changeGiven: null,
        cashAmount: null,
        digitalAmount: null
      });
    }
  };

  const persistRecipient = (id) => {
    setDigitalRecipient(id);
    persistSale({ digitalRecipientHostId: id });
  };

  const persistSplitAmounts = () => {
    const cashCents = cashStr.trim() ? parseMoney(cashStr) : null;
    const digCents = splitDigitalStr.trim() ? parseMoney(splitDigitalStr) : null;
    persistSale({
      cashAmount: cashCents,
      digitalAmount: digCents
    });
  };

  const clearOverride = () => {
    setOverrideStr('');
    setShowOverride(false);
    persistSale({ overrideTotal: null, discountAllocation: null });
  };

  // -------- Save / Cancel for completed transactions --------
  const saveChanges = async () => {
    // For completed transactions, item names + hosts and notes can change.
    // Persist everything in one shot then navigate back.
    await updateSale(eventId, saleId, {
      items,
      itemsSubtotal: itemsSubtotal(items),
      notes
    }).catch(() => {});
    // Build a structured per-field diff so the audit log can show "Reassigned
    // 'Books' from Rachel to Justin" instead of a generic "item hosts changed".
    const changes = [];
    const original = sale.items || [];
    const hostNameOf = (id) => hosts.find((h) => h.id === id)?.name || 'Unknown';
    const labelOf = (it) => (it.name?.trim() || `untitled ${formatMoney((it.qty || 1) * (it.unitPrice || 0))} item`);

    for (const it of items) {
      const prev = original.find((p) => p.id === it.id);
      if (!prev) continue;
      if ((prev.name || '') !== (it.name || '')) {
        const from = prev.name?.trim() || `untitled ${formatMoney((prev.qty || 1) * (prev.unitPrice || 0))} item`;
        const to = it.name?.trim() || `untitled ${formatMoney((it.qty || 1) * (it.unitPrice || 0))} item`;
        changes.push({
          kind: 'item.name.changed',
          itemId: it.id,
          from: prev.name || '',
          to: it.name || '',
          text: `Renamed "${from}" to "${to}"`
        });
      }
      if ((prev.hostId || '') !== (it.hostId || '')) {
        changes.push({
          kind: 'item.host.changed',
          itemId: it.id,
          itemName: it.name || '',
          itemSubtotal: (it.qty || 1) * (it.unitPrice || 0),
          from: prev.hostId,
          to: it.hostId,
          text: `Reassigned "${labelOf(it)}" from ${hostNameOf(prev.hostId)} to ${hostNameOf(it.hostId)}`
        });
      }
      if ((prev.saveForQuickAdd ?? false) !== (it.saveForQuickAdd ?? false)) {
        changes.push({
          kind: 'item.savequickadd.changed',
          itemId: it.id,
          itemName: it.name || '',
          itemSubtotal: (it.qty || 1) * (it.unitPrice || 0),
          from: !!prev.saveForQuickAdd,
          to: !!it.saveForQuickAdd,
          text: it.saveForQuickAdd
            ? `Marked "${labelOf(it)}" to save for quick-add`
            : `Unmarked "${labelOf(it)}" from save for quick-add`
        });
      }
    }
    if ((sale.notes || '') !== (notes || '')) {
      changes.push({
        kind: 'notes.changed',
        from: sale.notes || '',
        to: notes || '',
        text: (sale.notes || '').trim() === ''
          ? 'Added a note'
          : (notes || '').trim() === ''
            ? 'Cleared the note'
            : 'Updated the note'
      });
    }

    if (changes.length > 0) {
      const num = saleNumberMap?.[saleId];
      const prefix = `Transaction${num ? ` #${num}` : ''}`;
      const summary = changes.length === 1
        ? `${prefix}: ${changes[0].text}`
        : `${prefix}: ${changes.length} edits`;
      recordAudit(eventId, {
        type: 'transaction.edited',
        summary,
        byUid: uid,
        byHostId: currentHost.id,
        meta: { saleId, changes }
      });
    }
    navigate(`/e/${eventId}`);
  };

  const cancelChanges = () => {
    // Local state goes away on unmount. Firestore was never touched (deferred).
    navigate(`/e/${eventId}`);
  };

  // -------- top-level actions --------
  const submit = async () => {
    const subtotalNow = itemsSubtotal(items);
    const ov = overrideStr.trim() ? parseMoney(overrideStr) : null;
    const needsAllocation = ov != null && ov !== subtotalNow && ov < subtotalNow;
    const finalTot = ov != null ? ov : subtotalNow;
    const recipient = (isPureDigital || isSplit) ? (digitalRecipient || null) : null;

    let cashRecvCents = null;
    let cashAmt = null;
    let digAmt = null;
    let changeAmt = null;

    if (isPureCash) {
      cashRecvCents = cashStr.trim() ? parseMoney(cashStr) : null;
      if (cashRecvCents != null) {
        cashAmt = finalTot;
        digAmt = 0;
        changeAmt = cashRecvCents - finalTot;
      }
    } else if (isPureDigital) {
      cashAmt = 0;
      digAmt = finalTot;
    } else if (isSplit) {
      cashAmt = cashStr.trim() ? parseMoney(cashStr) : null;
      digAmt = splitDigitalStr.trim() ? parseMoney(splitDigitalStr) : null;
    }

    let status;
    if (isPureCash && cashRecvCents == null) status = 'draft';
    else if (isPureDigital && !recipient) status = 'draft';
    else if (isSplit && (cashAmt == null || digAmt == null || !recipient || cashAmt + digAmt !== finalTot)) status = 'draft';
    else if (needsAllocation && !allocation) status = 'pending-discount';
    else status = 'completed';

    await completeSale(eventId, saleId, {
      items,
      itemsSubtotal: subtotalNow,
      overrideTotal: ov,
      discountAllocation: allocation,
      paymentMethod,
      cashReceived: cashRecvCents,
      changeGiven: changeAmt,
      cashAmount: cashAmt,
      digitalAmount: digAmt,
      digitalRecipientHostId: recipient,
      notes,
      status
    });
    if (status !== 'draft') {
      for (const it of items) {
        if (!it.saveForQuickAdd || !it.name.trim()) continue;
        const exists = quickAdds.find((qa) =>
          qa.name.toLowerCase() === it.name.trim().toLowerCase() && qa.defaultPrice === it.unitPrice);
        if (!exists) {
          upsertQuickAdd(eventId, {
            name: it.name, defaultPrice: it.unitPrice, defaultHostId: it.hostId
          }).catch(() => {});
        }
      }
    }
    // Audit if this is a status transition. Going from draft → completed is
    // the canonical "transaction completed" event. Going from pending → completed
    // means the discount was resolved.
    const wasStatus = sale.status;
    const num = saleNumberMap?.[saleId];
    if (status === 'completed' && wasStatus !== 'completed') {
      let summary = `Completed transaction${num ? ` #${num}` : ''} — ${formatMoney(finalTot)}`;
      if (paymentMethod === 'cash') summary += ' (cash)';
      else if (paymentMethod === 'digital') {
        const recipientHost = hosts.find((h) => h.id === recipient);
        summary += ` (Venmo${recipientHost ? ' to ' + recipientHost.name : ''})`;
      } else if (paymentMethod === 'split') {
        const recipientHost = hosts.find((h) => h.id === recipient);
        summary += ` (split: ${formatMoney(cashAmt)} cash + ${formatMoney(digAmt)} Venmo${recipientHost ? ' to ' + recipientHost.name : ''})`;
      }
      recordAudit(eventId, {
        type: 'transaction.completed',
        summary,
        byUid: uid,
        byHostId: currentHost.id,
        meta: { saleId, total: finalTot, paymentMethod, cashAmount: cashAmt, digitalAmount: digAmt, recipient, fromStatus: wasStatus }
      });
    } else if (status === 'pending-discount' && wasStatus !== 'pending-discount') {
      recordAudit(eventId, {
        type: 'transaction.pending',
        summary: `Saved transaction${num ? ` #${num}` : ''} as pending — ${formatMoney(finalTot)}`,
        byUid: uid,
        byHostId: currentHost.id,
        meta: { saleId, total: finalTot, fromStatus: wasStatus }
      });
    }
    navigate(`/e/${eventId}`);
  };

  const discardDraft = async () => {
    if (!confirm('Discard this draft transaction?')) return;
    await hardDeleteDraft(eventId, saleId);
    recordAudit(eventId, {
      type: 'transaction.draft.discarded',
      summary: `Discarded a draft transaction`,
      byUid: uid,
      byHostId: currentHost.id,
      meta: { saleId }
    });
    navigate(`/e/${eventId}`);
  };

  const remove = async () => {
    if (!confirm('Delete this transaction? Totals will be updated. You can restore it from the audit log.')) return;
    await softDeleteSale(eventId, saleId, { hostId: currentHost.id });
    const num = saleNumberMap?.[saleId];
    recordAudit(eventId, {
      type: 'transaction.deleted',
      summary: `Deleted transaction${num ? ` #${num}` : ''} — ${formatMoney(effectiveTotalLocal())}`,
      byUid: uid,
      byHostId: currentHost.id,
      meta: { saleId, total: effectiveTotalLocal() }
    });
    navigate(`/e/${eventId}`);
  };

  const restore = async () => {
    await restoreSale(eventId, saleId);
    const num = saleNumberMap?.[saleId];
    recordAudit(eventId, {
      type: 'transaction.restored',
      summary: `Restored transaction${num ? ` #${num}` : ''}`,
      byUid: uid,
      byHostId: currentHost.id,
      meta: { saleId }
    });
  };

  // local helper for the deletion summary
  function effectiveTotalLocal() {
    if (sale.overrideTotal != null) return sale.overrideTotal;
    return itemsSubtotal(sale.items || []);
  }

  // -------- render --------
  return (
    <div className="min-h-screen flex flex-col bg-canvas pb-32">
      <EventHeader
        title={(() => {
          const num = saleNumberMap?.[saleId];
          const prefix = num ? `#${num} · ` : '';
          if (isDraft) return prefix + 'New transaction';
          if (isPendingState) return prefix + 'Resolve transaction';
          return prefix + 'Transaction';
        })()}
        backTo={`/e/${eventId}`}
        rightSlot={
          eventClosed ? null
            : isDeleted ? (
              <button onClick={restore} className="text-accent text-[14px] font-semibold p-2 active:opacity-60">
                <RotateCcw size={18} />
              </button>
            ) : (isCompleted || isPendingState) ? (
              <button onClick={remove} className="p-2 -mr-1 text-red-600 active:opacity-60" aria-label="Delete transaction">
                <Trash2 size={18} />
              </button>
            ) : null
        }
      />

      <main className="flex-1 px-4 py-5 flex flex-col gap-5">
        {eventClosed && (
          <Link
            to={`/e/${eventId}/settings`}
            className="card p-3 bg-slate-100 border border-slate-200 flex items-center gap-2 active:opacity-70"
          >
            <Lock size={16} className="text-slate-700 shrink-0" />
            <span className="text-[13px] text-slate-700 flex-1">
              Event closed. Reopen in settings to make changes.
            </span>
          </Link>
        )}
        {isDeleted && (
          <div className="card p-3 bg-red-50 border border-red-200 text-red-700 text-[13px]">
            This transaction has been deleted and is excluded from totals.
          </div>
        )}

        {/* ============ STAGE 1: RAPID ITEM ENTRY ============ */}
        {(isInProgress ? stage === 'items' : true) && (
          <>
            {editable && isInProgress && (
              <RapidEntryCard
                priceStr={rapidPriceStr}
                onPriceChange={setRapidPriceStr}
                priceRef={rapidPriceRef}
                hosts={hosts}
                currentHost={currentHost}
                onTapHost={addRapidItem}
              />
            )}

            {items.length > 0 ? (
              <section className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between px-1">
                  <h3 className="text-[12px] uppercase tracking-wide text-muted">
                    Items added · {items.length}
                  </h3>
                  <span className="text-[12px] text-muted tabular-nums">
                    Subtotal <span className="text-ink font-semibold">{formatMoney(subtotal)}</span>
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {items.map((it) => (
                    <ItemSummaryRow
                      key={it.id}
                      item={it}
                      host={hosts.find((h) => h.id === it.hostId)}
                      hosts={hosts}
                      editable={editable}
                      restricted={editable && !isInProgress}
                      onUpdate={(patch) => editItem(it.id, patch)}
                      onRemove={editable && isInProgress ? () => deleteItem(it.id) : undefined}
                    />
                  ))}
                </div>
              </section>
            ) : (
              !editable && (
                <div className="card p-6 text-center text-muted text-[14px]">No items.</div>
              )
            )}

            {editable && quickAdds.length > 0 && (
              <QuickAddStrip
                quickAdds={quickAdds}
                hosts={hosts}
                onTap={addQuickAdd}
                onRemove={handleRemoveQuickAdd}
              />
            )}
          </>
        )}

        {/* ============ STAGE 2: PAYMENT ============ */}
        {(isInProgress ? stage === 'payment' : true) && items.length > 0 && (
          <ItemsByHostSummary
            items={items}
            hosts={hosts}
            currentHost={currentHost}
            editable={editable}
            restricted={editable && !isInProgress}
            onUpdateItem={editable ? editItem : undefined}
            onRemoveItem={editable && isInProgress ? deleteItem : undefined}
          />
        )}

        {/* ============ TOTAL + CASH ============ */}
        {(isInProgress ? stage === 'payment' : true) && items.length > 0 && (
          <section className="card p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-muted text-[14px]">Customer pays</span>
              <span className="text-[32px] font-bold tabular-nums leading-none">{formatMoney(finalTotal)}</span>
            </div>

            {/* Negotiate row — hidden by default */}
            {showOverride || overrideActive ? (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted text-[14px]">Negotiated to</span>
                  <div className="flex items-center gap-1">
                    <MoneyInput
                      ref={overrideInputRef}
                      value={overrideStr}
                      onChange={setOverrideStr}
                      onBlur={persistOverride}
                      disabled={!moneyEditable}
                      placeholder="—"
                      className="w-28 text-right rounded-xl bg-white border border-hairline px-3 py-2 outline-none focus:border-accent tabular-nums disabled:opacity-60"
                    />
                    {moneyEditable && (
                      <button onClick={clearOverride} className="text-muted active:opacity-50 p-1" aria-label="Clear negotiated price">
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>
                {overrideActive && (
                  <div className={`text-[12px] ${discount > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {discount > 0
                      ? `Subtotal was ${formatMoney(subtotal)} — ${formatMoney(discount)} off`
                      : `Tip of ${formatMoney(-discount)} above subtotal`}
                  </div>
                )}
              </div>
            ) : (
              moneyEditable && (
                <button
                  onClick={handleOpenNegotiate}
                  className="text-accent font-semibold text-[13px] self-start active:opacity-60"
                >
                  Customer wants to negotiate?
                </button>
              )
            )}

            {/* Payment method toggle */}
            <div className="border-t border-hairline pt-4 grid grid-cols-3 gap-2">
              <PaymentToggle
                method="cash"
                active={isPureCash}
                disabled={!moneyEditable}
                icon={<Banknote size={16} />}
                label="Cash"
                onClick={() => switchPaymentMethod('cash')}
              />
              <PaymentToggle
                method="digital"
                active={isPureDigital}
                disabled={!moneyEditable}
                icon={<Smartphone size={16} />}
                label="Venmo"
                onClick={() => switchPaymentMethod('digital')}
              />
              <PaymentToggle
                method="split"
                active={isSplit}
                disabled={!moneyEditable}
                icon={<Wallet size={16} />}
                label="Split"
                onClick={() => switchPaymentMethod('split')}
              />
            </div>

            {isPureCash && (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-[15px]">Cash received</span>
                  <MoneyInput
                    value={cashStr}
                    onChange={setCashStr}
                    onBlur={persistCash}
                    disabled={!moneyEditable}
                    placeholder="$0.00"
                    className="w-32 text-right rounded-xl bg-white border border-hairline px-3 py-2 outline-none focus:border-accent tabular-nums text-[18px] font-semibold disabled:opacity-60"
                  />
                </div>
                {cashReceived != null && change > 0 && (
                  <div className="flex items-center justify-between bg-emerald-50 text-emerald-700 rounded-xl p-3">
                    <span className="font-semibold">Change owed</span>
                    <span className="text-[22px] font-bold tabular-nums">{formatMoney(change)}</span>
                  </div>
                )}
                {cashReceived != null && change === 0 && (
                  <div className="text-center text-[12px] text-muted">Exact cash 👌</div>
                )}
              </>
            )}

            {isPureDigital && (
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-[15px]">Sent to</span>
                <select
                  className="w-44 rounded-xl bg-white border border-hairline px-3 py-2 outline-none focus:border-accent disabled:opacity-60 text-[14px]"
                  value={digitalRecipient}
                  onChange={(e) => persistRecipient(e.target.value)}
                  disabled={!moneyEditable}
                >
                  <option value="" disabled>Pick recipient</option>
                  {hosts.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}{h.id === currentHost.id ? ' (you)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {isSplit && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[14px] flex items-center gap-1.5"><Banknote size={14} className="text-muted" /> Cash portion</span>
                  <MoneyInput
                    value={cashStr}
                    onChange={setCashStr}
                    onBlur={persistSplitAmounts}
                    disabled={!moneyEditable}
                    placeholder="$0.00"
                    className="w-28 text-right rounded-xl bg-white border border-hairline px-3 py-2 outline-none focus:border-accent tabular-nums disabled:opacity-60"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[14px] flex items-center gap-1.5"><Smartphone size={14} className="text-muted" /> Venmo portion</span>
                  <MoneyInput
                    value={splitDigitalStr}
                    onChange={setSplitDigitalStr}
                    onBlur={persistSplitAmounts}
                    disabled={!moneyEditable}
                    placeholder="$0.00"
                    className="w-28 text-right rounded-xl bg-white border border-hairline px-3 py-2 outline-none focus:border-accent tabular-nums disabled:opacity-60"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[14px]">Sent to</span>
                  <select
                    className="w-44 rounded-xl bg-white border border-hairline px-3 py-2 outline-none focus:border-accent disabled:opacity-60 text-[14px]"
                    value={digitalRecipient}
                    onChange={(e) => persistRecipient(e.target.value)}
                    disabled={!moneyEditable}
                  >
                    <option value="" disabled>Pick recipient</option>
                    {hosts.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}{h.id === currentHost.id ? ' (you)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                {!splitIncomplete && (
                  <div className={`text-[12px] flex items-center justify-between rounded-lg px-3 py-2 ${
                    splitMismatch ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
                  }`}>
                    <span>Sum of portions</span>
                    <span className="font-semibold tabular-nums">
                      {formatMoney(splitSum)} / {formatMoney(finalTotal)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* ============ DISCOUNT ALLOCATION ============ */}
        {(isInProgress ? stage === 'payment' : true) && overrideActive && discount > 0 && moneyEditable && (
          <section className="flex flex-col gap-2">
            <h3 className="text-[14px] font-semibold px-2">
              How should the {formatMoney(discount)} discount be split?
            </h3>
            <AllocationCards
              hosts={hosts}
              perHostFromItems={perHostFromItemsMap}
              discount={discount}
              allocation={allocation}
              onChange={setAllocation}
              finalSubtotal={subtotal - discount}
            />
            {!allocation && (
              <div className="flex items-center gap-2 text-amber-700 text-[12px] px-2">
                <AlertTriangle size={14} />
                Transaction will be saved as pending and excluded from totals until you choose.
              </div>
            )}
          </section>
        )}

        {/* ============ PER-HOST BREAKDOWN ============ */}
        {/* Only shown when relevant — i.e. when there's a discount that affects the split */}
        {(isInProgress ? stage === 'payment' : true) && items.length > 0 && overrideActive && discount > 0 && (
          <section className="card p-4 flex flex-col gap-2">
            <h3 className="text-[12px] uppercase tracking-wide text-muted">Each host gets</h3>
            {hosts.map((h) => {
              const fromItems = perHostFromItemsMap[h.id] || 0;
              if (fromItems === 0) return null;
              const amt = finalPerHost ? finalPerHost[h.id] : fromItems;
              const pending = finalPerHost == null;
              return (
                <div key={h.id} className="flex items-center justify-between text-[14px]">
                  <span>{h.name}{h.id === currentHost.id ? ' (you)' : ''}</span>
                  <span className={`font-semibold tabular-nums ${pending ? 'text-amber-600' : ''}`}>
                    {pending ? 'pending' : formatMoney(amt || 0)}
                  </span>
                </div>
              );
            })}
          </section>
        )}

        {/* ============ NOTES ============ */}
        {(isInProgress ? stage === 'payment' : true) && items.length > 0 && (
          showNotes || notes ? (
            <section className="flex flex-col gap-1">
              <h3 className="text-[12px] uppercase tracking-wide text-muted px-2">Note</h3>
              <textarea
                ref={notesInputRef}
                className="input min-h-[64px]"
                placeholder="anything worth remembering"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={persistNotes}
                disabled={!editable}
              />
            </section>
          ) : (
            editable && (
              <button
                onClick={handleOpenNotes}
                className="text-accent font-semibold text-[13px] self-start active:opacity-60 px-2 flex items-center gap-1"
              >
                <MessageSquarePlus size={14} /> Add a note
              </button>
            )
          )
        )}

        {(isInProgress ? stage === 'payment' : true) && enteredByHost && (
          <div className="text-[11px] text-muted text-center pt-2">
            Entered by {enteredByHost.name}
          </div>
        )}
      </main>

      {/* ============ ACTION BAR (only during in-progress entry/resolution) ============ */}
      {editable && isInProgress && stage === 'items' && (
        <div
          className="fixed bottom-0 left-0 right-0 px-4 pt-3 bg-white/95 backdrop-blur-xl border-t border-hairline flex gap-2"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          {isDraft && (
            <button onClick={discardDraft} className="btn-secondary flex-1">Discard</button>
          )}
          <button
            onClick={() => setStage('payment')}
            disabled={!itemsValid}
            className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40"
          >
            Continue <ArrowRight size={18} />
          </button>
        </div>
      )}

      {editable && isInProgress && stage === 'payment' && (
        <div
          className="fixed bottom-0 left-0 right-0 px-4 pt-3 bg-white/95 backdrop-blur-xl border-t border-hairline flex gap-2"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={() => setStage('items')}
            className="btn-secondary px-4 flex items-center gap-1"
            aria-label="Back to items"
          >
            <ChevronLeft size={18} /> Items
          </button>
          <CompleteButton
            disabled={!canSubmit}
            cashShort={cashShort}
            splitMismatch={splitMismatch}
            saveAsDraft={itemsValid && (cashMissing || recipientMissing || splitIncomplete)}
            willBePending={willBePending}
            shortBy={cashShort ? finalTotal - cashReceived : 0}
            onClick={submit}
          />
        </div>
      )}

      {/* Save / Cancel for completed (editable but not in-progress) */}
      {deferredSave && (
        <div
          className="fixed bottom-0 left-0 right-0 px-4 pt-3 bg-white/95 backdrop-blur-xl border-t border-hairline flex gap-2"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <button onClick={cancelChanges} className="btn-secondary flex-1">Cancel</button>
          <button onClick={saveChanges} className="btn-primary flex-1 flex items-center justify-center gap-1">
            <Check size={18} /> Save changes
          </button>
        </div>
      )}

    </div>
  );
}

// ============================================================
// RAPID ENTRY CARD (stage 1: price input + host buttons)
// ============================================================
function RapidEntryCard({ priceStr, onPriceChange, priceRef, hosts, currentHost, onTapHost }) {
  const priceCents = parseMoney(priceStr);
  const hasValidPrice = priceCents != null && priceCents > 0;
  const singleHost = hosts.length === 1;

  return (
    <section className="card p-5 flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label className="text-[11px] uppercase tracking-wide text-muted px-1">Price</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted text-[26px] font-semibold pointer-events-none">$</span>
          <MoneyInput
            ref={priceRef}
            autoFocus
            value={priceStr}
            onChange={onPriceChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && singleHost && hasValidPrice) {
                onTapHost(hosts[0].id);
              }
            }}
            placeholder="0.00"
            className="w-full text-[28px] font-bold tabular-nums rounded-2xl bg-white border border-hairline pl-10 pr-4 py-4 outline-none focus:border-accent"
          />
        </div>
      </div>

      {singleHost ? (
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onTapHost(hosts[0].id)}
          disabled={!hasValidPrice}
          className="btn-primary flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <Plus size={20} /> Add item
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <label className="text-[11px] uppercase tracking-wide text-muted px-1">Whose item?</label>
          <div className="grid grid-cols-2 gap-2">
            {hosts.map((h) => (
              <RapidHostButton
                key={h.id}
                host={h}
                hosts={hosts}
                isYou={h.id === currentHost.id}
                disabled={!hasValidPrice}
                onClick={() => onTapHost(h.id)}
              />
            ))}
          </div>
          {!hasValidPrice && (
            <div className="text-[11px] text-muted text-center pt-1">
              Type a price first, then tap a host.
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function RapidHostButton({ host, hosts, isYou, disabled, onClick }) {
  const c = hostColor(host.id, hosts);
  return (
    <button
      type="button"
      // prevent the input from blurring (and the keyboard from dropping) on tap
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-2xl py-4 px-4 font-semibold text-[15px] flex items-center gap-2 active:opacity-70 disabled:opacity-40 transition-opacity border-2 ${c.bg} ${c.text} ${c.border}`}
    >
      <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
      <span className="truncate">{host.name}{isYou ? ' (you)' : ''}</span>
    </button>
  );
}

// ============================================================
// ITEMS BY HOST SUMMARY (stage 2: grouped review)
// ============================================================
function ItemsByHostSummary({ items, hosts, currentHost, editable, restricted, onUpdateItem, onRemoveItem }) {
  // Group items by hostId, preserving host order from the hosts list.
  const byHost = hosts
    .map((h) => ({
      host: h,
      items: items.filter((it) => it.hostId === h.id),
      total: items
        .filter((it) => it.hostId === h.id)
        .reduce((sum, it) => sum + (it.qty || 0) * (it.unitPrice || 0), 0)
    }))
    .filter((g) => g.items.length > 0);

  // Items with no hostId (shouldn't happen, but defensive)
  const orphaned = items.filter((it) => !it.hostId || !hosts.some((h) => h.id === it.hostId));

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[12px] uppercase tracking-wide text-muted px-2">Items by host</h3>
      {byHost.map((g) => (
        <details key={g.host.id} className="card group">
          <summary className="cursor-pointer list-none p-3 flex items-center justify-between gap-2 active:opacity-70">
            <HostPill host={g.host} hosts={hosts} you={g.host.id === currentHost.id} />
            <span className="flex items-center gap-2 text-[13px] text-muted">
              <span>× {g.items.length}</span>
              <span className="text-ink font-bold tabular-nums">{formatMoney(g.total)}</span>
              <ChevronLeft size={14} className="-rotate-90 transition-transform group-open:rotate-90 text-muted" />
            </span>
          </summary>
          <div className="px-3 pb-3 pt-0 flex flex-col gap-1.5 border-t border-hairline">
            {g.items.map((it) => (
              <CompactItemRow
                key={it.id}
                item={it}
                hosts={hosts}
                editable={editable}
                restricted={restricted}
                onUpdate={onUpdateItem ? (patch) => onUpdateItem(it.id, patch) : undefined}
                onRemove={onRemoveItem ? () => onRemoveItem(it.id) : undefined}
              />
            ))}
          </div>
        </details>
      ))}
      {orphaned.length > 0 && (
        <div className="card p-3 text-[12px] text-muted">
          {orphaned.length} item{orphaned.length === 1 ? '' : 's'} with no host. Tap to assign.
        </div>
      )}
    </section>
  );
}

function CompactItemRow({ item, hosts, editable, restricted, onUpdate, onRemove }) {
  const [expanded, setExpanded] = useState(false);
  const subtotal = (item.qty || 0) * (item.unitPrice || 0);
  const hasName = !!item.name?.trim();

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 text-[13px]">
        <button
          type="button"
          onClick={editable ? () => setExpanded((v) => !v) : undefined}
          disabled={!editable}
          className="flex-1 min-w-0 flex items-center gap-2 text-left active:opacity-60 disabled:active:opacity-100"
        >
          <span className="font-bold tabular-nums shrink-0 w-16">{formatMoney(subtotal)}</span>
          <span className="text-muted truncate flex-1 min-w-0">
            {hasName ? (
              (item.qty || 1) > 1 ? `${item.qty} × ${item.name}` : item.name
            ) : (
              <span className="italic">untitled</span>
            )}
          </span>
          {editable && (
            <ChevronDown size={12} className={`text-muted shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          )}
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
            className="p-1 text-muted active:opacity-60 shrink-0"
            aria-label="Remove item"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {expanded && editable && onUpdate && hosts && (
        <div className="mt-2 -mx-3 -mb-3">
          <InlineItemEditForm
            item={item}
            hosts={hosts}
            onUpdate={onUpdate}
            onRemove={onRemove}
            restricted={restricted}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================
// ITEM SUMMARY ROW (read-only, tap to edit)
// ============================================================
function ItemSummaryRow({ item, host, hosts, editable, restricted, onUpdate, onRemove }) {
  const [expanded, setExpanded] = useState(false);
  const subtotal = (item.qty || 0) * (item.unitPrice || 0);
  const hasName = !!item.name?.trim();

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          onClick={editable ? () => setExpanded((v) => !v) : undefined}
          disabled={!editable}
          className="flex-1 min-w-0 flex items-center gap-2 text-left active:opacity-70 disabled:active:opacity-100"
        >
          <span className="font-bold tabular-nums text-[17px] shrink-0">{formatMoney(subtotal)}</span>
          {host && <HostPill host={host} hosts={hosts} size="sm" />}
          <span className="text-[13px] text-muted truncate flex-1 min-w-0">
            {hasName ? (
              (item.qty || 1) > 1 ? `${item.qty} × ${item.name}` : item.name
            ) : (
              <span className="italic">untitled</span>
            )}
            {item.saveForQuickAdd && <span className="ml-2 text-amber-600">★</span>}
          </span>
          {editable && (
            <ChevronDown size={14} className={`text-muted shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          )}
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
            className="p-2 text-muted active:opacity-60 shrink-0"
            aria-label="Remove item"
          >
            <X size={18} />
          </button>
        )}
      </div>
      {expanded && editable && onUpdate && (
        <InlineItemEditForm
          item={item}
          hosts={hosts}
          onUpdate={onUpdate}
          onRemove={onRemove}
          restricted={restricted}
        />
      )}
    </div>
  );
}

// ============================================================
// QUICK ADD STRIP
// ============================================================
function QuickAddStrip({ quickAdds, hosts, onTap, onRemove, title }) {
  return (
    <div className="flex flex-col gap-2 mt-1">
      <div className="text-[11px] uppercase tracking-wide text-muted flex items-center gap-1 px-2">
        <Sparkles size={12} /> {title || 'Quick add'}
      </div>
      <div className="flex flex-wrap gap-2 px-1">
        {quickAdds.slice(0, 12).map((qa) => {
          const host = qa.defaultHostId && hosts ? hosts.find((h) => h.id === qa.defaultHostId) : null;
          return (
            <div
              key={qa.id}
              className="flex items-stretch bg-white border border-hairline rounded-full overflow-hidden"
            >
              <button
                type="button"
                onClick={() => onTap(qa)}
                className="flex items-center gap-1.5 pl-1 pr-3 py-1 text-[13px] active:opacity-60"
              >
                {host ? (
                  <HostPill host={host} hosts={hosts} size="sm" />
                ) : (
                  <Tag size={12} className="text-muted ml-1.5" />
                )}
                <span>{qa.name}</span>
                <span className="text-muted tabular-nums">{formatMoney(qa.defaultPrice)}</span>
              </button>
              {onRemove && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRemove(qa);
                  }}
                  className="text-muted active:opacity-60 px-2 border-l border-hairline flex items-center"
                  aria-label={`Remove ${qa.name} from quick-add`}
                  title="Remove from quick-add"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// INLINE ITEM EDIT FORM (used inside ItemSummaryRow when expanded)
// ============================================================
function InlineItemEditForm({ item, hosts, onUpdate, onRemove, restricted }) {
  const [name, setName] = useState(item.name || '');
  const [qtyStr, setQtyStr] = useState(String(item.qty || 1));
  const [priceStr, setPriceStr] = useState(((item.unitPrice || 0) / 100).toFixed(2));

  return (
    <div className="border-t border-hairline px-3 py-3 flex flex-col gap-3 bg-canvas">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-muted">What is it?</span>
        <input
          className="input"
          placeholder="(untitled)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => onUpdate({ name: name.trim() })}
        />
      </label>

      <div className="flex gap-2">
        <label className="flex flex-col gap-1 w-20">
          <span className="text-[11px] uppercase tracking-wide text-muted">Qty</span>
          <input
            className="input text-center disabled:opacity-50"
            type="text"
            inputMode="numeric"
            value={qtyStr}
            disabled={restricted}
            onFocus={(e) => { try { e.target.select(); } catch {} }}
            onChange={(e) => setQtyStr(e.target.value.replace(/[^0-9]/g, ''))}
            onBlur={() => onUpdate({ qty: Math.max(1, Number(qtyStr) || 1) })}
          />
        </label>
        <label className="flex flex-col gap-1 flex-1">
          <span className="text-[11px] uppercase tracking-wide text-muted">Price each</span>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none">$</span>
            <MoneyInput
              className="input pl-7 text-right tabular-nums disabled:opacity-50"
              value={priceStr}
              disabled={restricted}
              onChange={setPriceStr}
              onBlur={() => onUpdate({ unitPrice: parseMoney(priceStr) ?? 0 })}
            />
          </div>
        </label>
      </div>
      {restricted && (
        <div className="text-[11px] text-muted -mt-2 px-1">
          Qty and price are locked once the transaction is complete (would change historical totals).
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-muted">Whose item?</span>
        <select
          className="input"
          value={item.hostId || ''}
          onChange={(e) => onUpdate({ hostId: e.target.value })}
        >
          <option value="" disabled>Pick a host</option>
          {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </label>

      <label className="flex items-center gap-3 cursor-pointer select-none py-1">
        <input
          type="checkbox"
          checked={!!item.saveForQuickAdd}
          onChange={(e) => onUpdate({ saveForQuickAdd: e.target.checked })}
          className="w-5 h-5 rounded accent-amber-500"
        />
        <span className="text-[13px]">Save this item to quick-add for later</span>
      </label>

      {onRemove && !restricted && (
        <button
          onClick={onRemove}
          className="rounded-2xl border border-red-200 text-red-600 font-semibold py-2 active:opacity-60 text-[13px] flex items-center justify-center gap-1.5"
        >
          <Trash2 size={14} /> Remove from transaction
        </button>
      )}
    </div>
  );
}

// ============================================================
// ALLOCATION CARDS (3 friendly choices)
// ============================================================
function AllocationCards({ hosts, perHostFromItems, discount, allocation, onChange, finalSubtotal }) {
  const [showManual, setShowManual] = useState(allocation && typeof allocation === 'object');
  const isProp = allocation === 'proportional';
  const isManual = allocation && typeof allocation === 'object';
  const isLater = allocation == null;

  return (
    <div className="flex flex-col gap-2">
      <ChoiceCard
        title="Split fairly"
        body="Each host gives back the same % of their items."
        active={isProp}
        onClick={() => { setShowManual(false); onChange('proportional'); }}
      />
      <ChoiceCard
        title="Set custom amounts"
        body="Decide exactly how much each host loses."
        active={isManual || showManual}
        onClick={() => { setShowManual(true); }}
      />
      {showManual && (
        <ManualSplitForm
          hosts={hosts}
          perHostFromItems={perHostFromItems}
          discount={discount}
          finalSubtotal={finalSubtotal}
          initial={isManual ? allocation : proportionalAllocation(perHostFromItems, discount)}
          onSave={(map) => onChange(map)}
        />
      )}
      <ChoiceCard
        title="Decide later"
        body="Save now, come back to this. Transaction won't be in the totals yet."
        active={isLater && !showManual}
        onClick={() => { setShowManual(false); onChange(null); }}
      />
    </div>
  );
}

function ChoiceCard({ title, body, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`card p-4 text-left flex items-start gap-3 active:opacity-80 ${
        active ? 'ring-2 ring-accent' : ''
      }`}
    >
      <div className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center shrink-0 ${
        active ? 'border-accent bg-accent text-white' : 'border-hairline'
      }`}>
        {active && <Check size={12} strokeWidth={3} />}
      </div>
      <div className="min-w-0">
        <div className="font-semibold text-[15px]">{title}</div>
        <div className="text-[12px] text-muted">{body}</div>
      </div>
    </button>
  );
}

function ManualSplitForm({ hosts, perHostFromItems, discount, finalSubtotal, initial, onSave }) {
  const [map, setMap] = useState(initial);
  const sum = Object.values(map).reduce((a, b) => a + b, 0);
  const ok = sum === finalSubtotal;
  return (
    <div className="card p-4 flex flex-col gap-3 ml-8">
      {hosts.map((h) => {
        const fromItems = perHostFromItems[h.id] || 0;
        if (fromItems === 0) return null;
        return (
          <ManualHostInput
            key={h.id}
            host={h}
            fromItems={fromItems}
            value={map[h.id] ?? 0}
            onChange={(v) => setMap((m) => ({ ...m, [h.id]: v }))}
          />
        );
      })}
      <div className={`flex items-center justify-between text-[12px] ${ok ? 'text-emerald-700' : 'text-red-600'}`}>
        <span>Total of host shares</span>
        <span className="tabular-nums">
          {formatMoney(sum)} / {formatMoney(finalSubtotal)}
        </span>
      </div>
      <button
        disabled={!ok}
        onClick={() => onSave(map)}
        className="btn-primary text-[14px] py-2"
      >
        Use these amounts
      </button>
    </div>
  );
}

function ManualHostInput({ host, fromItems, value, onChange }) {
  const [str, setStr] = useState((value / 100).toFixed(2));
  useEffect(() => { setStr((value / 100).toFixed(2)); }, [value]);
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 text-[14px]">{host.name}</span>
      <span className="text-[11px] text-muted tabular-nums">was {formatMoney(fromItems)}</span>
      <MoneyInput
        value={str}
        onChange={setStr}
        onBlur={() => onChange(parseMoney(str) ?? 0)}
        className="w-24 text-right rounded-xl bg-white border border-hairline px-2 py-2 tabular-nums outline-none focus:border-accent"
      />
    </div>
  );
}

// ============================================================
// COMPLETE BUTTON
// ============================================================
function PaymentToggle({ method, active, disabled, icon, label, onClick }) {
  // Active state matches the per-method palette used on the home-page
  // transaction rows (cash = emerald, Venmo = sky, split = amber).
  const styles = {
    cash: 'bg-emerald-100 text-emerald-800 border-emerald-500',
    digital: 'bg-sky-100 text-sky-800 border-sky-500',
    split: 'bg-amber-100 text-amber-800 border-amber-500'
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-2 rounded-2xl py-3 font-semibold text-[14px] active:opacity-80 disabled:opacity-50 border-2 ${
        active
          ? styles[method] || 'bg-accent/10 text-accent-deep border-accent'
          : 'bg-white text-ink border-hairline'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function CompleteButton({ disabled, cashShort, splitMismatch, saveAsDraft, willBePending, shortBy, onClick }) {
  let label = 'Complete transaction';
  let icon = <Check size={18} />;
  let classes = 'bg-accent text-white';
  if (cashShort) {
    label = `Customer still owes ${formatMoney(shortBy)}`;
    icon = <AlertTriangle size={18} />;
    classes = 'bg-red-500 text-white';
  } else if (splitMismatch) {
    label = `Split doesn't match total`;
    icon = <AlertTriangle size={18} />;
    classes = 'bg-red-500 text-white';
  } else if (saveAsDraft) {
    label = 'Save as draft';
    icon = <Pencil size={18} />;
    classes = 'bg-white text-ink border border-hairline';
  } else if (willBePending) {
    label = 'Save as pending';
    icon = <AlertTriangle size={18} />;
    classes = 'bg-amber-500 text-white';
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 flex items-center justify-center gap-1 rounded-2xl font-semibold py-3.5 px-5 active:opacity-80 disabled:opacity-50 ${classes}`}
    >
      {icon}
      {label}
    </button>
  );
}
