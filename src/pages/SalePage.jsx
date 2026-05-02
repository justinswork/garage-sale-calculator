import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Trash2, Plus, X, Check, AlertTriangle, RotateCcw, Sparkles, ShoppingBag,
  Pencil, MessageSquarePlus, Tag, Banknote, Smartphone, Lock
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEvent } from '../contexts/EventContext.jsx';
import EventHeader from '../components/EventHeader.jsx';
import Loader from '../components/Loader.jsx';
import {
  watchSale, updateSale, completeSale,
  softDeleteSale, restoreSale, hardDeleteDraft
} from '../data/sales.js';
import { watchQuickAdds, upsertQuickAdd, touchQuickAdd, removeQuickAdd } from '../data/quickAdd.js';
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

  // item edit sheet: null | 'new' | <itemId>
  const [editingItemId, setEditingItemId] = useState(null);

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

  if (sale === undefined) return <Loader label="Loading sale…" />;
  if (sale === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <p className="font-semibold mb-2">Sale not found</p>
        <button className="btn-secondary" onClick={() => navigate(`/e/${eventId}`)}>Back to event</button>
      </div>
    );
  }

  const isDeleted = !!sale.deletedAt;
  const isDraft = sale.status === 'draft';
  const isPendingState = sale.status === 'pending-discount';
  const isCompleted = sale.status === 'completed';
  const eventClosed = event.status === 'closed';
  const editable = !isDeleted && (isDraft || isPendingState) && !eventClosed;
  const willBePending = overrideActive && discount > 0 && !allocation;
  const itemsValid = items.length > 0 && items.every((it) =>
    it.name.trim() && it.hostId && it.unitPrice >= 0 && it.qty > 0);
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

  // -------- item edit sheet helpers --------
  const editingItem = editingItemId == null ? null
    : editingItemId === 'new'
      ? { id: shortId(6), name: '', qty: 1, unitPrice: 0, hostId: currentHost.id, saveForQuickAdd: false, _isNew: true }
      : items.find((it) => it.id === editingItemId);

  const persistItems = (list) => {
    updateSale(eventId, saleId, {
      items: list,
      itemsSubtotal: itemsSubtotal(list)
    }).catch(() => {});
  };

  const saveItem = (item) => {
    const clean = { ...item };
    delete clean._isNew;
    let next;
    if (editingItemId === 'new') next = [...items, clean];
    else next = items.map((it) => (it.id === clean.id ? clean : it));
    setItems(next);
    persistItems(next);
    setEditingItemId(null);
  };

  const deleteItem = (id) => {
    const next = items.filter((it) => it.id !== id);
    setItems(next);
    persistItems(next);
    setEditingItemId(null);
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
  };

  const handleRemoveQuickAdd = async (qa) => {
    if (!confirm(`Remove "${qa.name}" from quick-add?`)) return;
    await removeQuickAdd(eventId, qa.id).catch(() => {});
  };

  const persistOverride = () => {
    const cents = overrideStr.trim() ? parseMoney(overrideStr) : null;
    updateSale(eventId, saleId, {
      overrideTotal: cents,
      discountAllocation: cents == null ? null : sale.discountAllocation
    }).catch(() => {});
  };

  const persistCash = () => {
    const cents = cashStr.trim() ? parseMoney(cashStr) : null;
    updateSale(eventId, saleId, {
      cashReceived: cents,
      changeGiven: cents != null ? cents - finalTotal : null
    }).catch(() => {});
  };

  const persistNotes = () => updateSale(eventId, saleId, { notes }).catch(() => {});
  const setAllocation = (alloc) => updateSale(eventId, saleId, { discountAllocation: alloc }).catch(() => {});

  const switchPaymentMethod = (method) => {
    setPaymentMethod(method);
    if (method === 'cash') {
      setDigitalRecipient('');
      setSplitDigitalStr('');
      updateSale(eventId, saleId, {
        paymentMethod: 'cash',
        digitalRecipientHostId: null,
        cashAmount: null,
        digitalAmount: null
      }).catch(() => {});
    } else if (method === 'digital') {
      const r = digitalRecipient || currentHost.id;
      setDigitalRecipient(r);
      setCashStr('');
      setSplitDigitalStr('');
      updateSale(eventId, saleId, {
        paymentMethod: 'digital',
        digitalRecipientHostId: r,
        cashReceived: null,
        changeGiven: null,
        cashAmount: null,
        digitalAmount: null
      }).catch(() => {});
    } else { // split
      const r = digitalRecipient || currentHost.id;
      setDigitalRecipient(r);
      setCashStr('');
      setSplitDigitalStr('');
      updateSale(eventId, saleId, {
        paymentMethod: 'split',
        digitalRecipientHostId: r,
        cashReceived: null,
        changeGiven: null,
        cashAmount: null,
        digitalAmount: null
      }).catch(() => {});
    }
  };

  const persistRecipient = (id) => {
    setDigitalRecipient(id);
    updateSale(eventId, saleId, { digitalRecipientHostId: id }).catch(() => {});
  };

  const persistSplitAmounts = () => {
    const cashCents = cashStr.trim() ? parseMoney(cashStr) : null;
    const digCents = splitDigitalStr.trim() ? parseMoney(splitDigitalStr) : null;
    updateSale(eventId, saleId, {
      cashAmount: cashCents,
      digitalAmount: digCents
    }).catch(() => {});
  };

  const clearOverride = () => {
    setOverrideStr('');
    setShowOverride(false);
    updateSale(eventId, saleId, { overrideTotal: null, discountAllocation: null }).catch(() => {});
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
    navigate(`/e/${eventId}`);
  };

  const discardDraft = async () => {
    if (!confirm('Discard this draft sale?')) return;
    await hardDeleteDraft(eventId, saleId);
    navigate(`/e/${eventId}`);
  };

  const remove = async () => {
    if (!confirm('Delete this sale? Totals will be updated. You can restore it from the audit log.')) return;
    await softDeleteSale(eventId, saleId, { hostId: currentHost.id });
    navigate(`/e/${eventId}`);
  };

  const restore = async () => restoreSale(eventId, saleId);

  // -------- render --------
  return (
    <div className="min-h-screen flex flex-col bg-canvas pb-32">
      <EventHeader
        title={(() => {
          const num = saleNumberMap?.[saleId];
          const prefix = num ? `#${num} · ` : '';
          if (isDraft) return prefix + 'New sale';
          if (isPendingState) return prefix + 'Resolve sale';
          return prefix + 'Sale';
        })()}
        backTo={`/e/${eventId}`}
        rightSlot={
          eventClosed ? null
            : isDeleted ? (
              <button onClick={restore} className="text-accent text-[14px] font-semibold p-2 active:opacity-60">
                <RotateCcw size={18} />
              </button>
            ) : (isCompleted || isPendingState) ? (
              <button onClick={remove} className="p-2 -mr-1 text-red-600 active:opacity-60" aria-label="Delete sale">
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
            This sale has been deleted and is excluded from totals.
          </div>
        )}

        {/* ============ ITEMS ============ */}
        {items.length === 0 ? (
          <EmptyItemsHero
            disabled={!editable}
            onAdd={() => setEditingItemId('new')}
            quickAdds={quickAdds}
            hosts={hosts}
            onQuickAdd={editable ? addQuickAdd : undefined}
            onRemoveQuickAdd={editable ? handleRemoveQuickAdd : undefined}
          />
        ) : (
          <section className="flex flex-col gap-2">
            <div className="flex flex-col gap-2">
              {items.map((it) => (
                <ItemSummaryRow
                  key={it.id}
                  item={it}
                  host={hosts.find((h) => h.id === it.hostId)}
                  onTap={editable ? () => setEditingItemId(it.id) : undefined}
                />
              ))}
            </div>
            {editable && (
              <button
                onClick={() => setEditingItemId('new')}
                className="mt-2 flex items-center justify-center gap-2 rounded-2xl bg-accent/10 text-accent-deep font-semibold py-3.5 active:opacity-70"
              >
                <Plus size={20} /> Add another item
              </button>
            )}
            {editable && quickAdds.length > 0 && (
              <QuickAddStrip
                quickAdds={quickAdds}
                hosts={hosts}
                onTap={addQuickAdd}
                onRemove={editable ? handleRemoveQuickAdd : undefined}
              />
            )}
          </section>
        )}

        {/* ============ TOTAL + CASH ============ */}
        {items.length > 0 && (
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
                      disabled={!editable}
                      placeholder="—"
                      className="w-28 text-right rounded-xl bg-white border border-hairline px-3 py-2 outline-none focus:border-accent tabular-nums disabled:opacity-60"
                    />
                    {editable && (
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
              editable && (
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
                active={isPureCash}
                disabled={!editable}
                icon={<Banknote size={16} />}
                label="Cash"
                onClick={() => switchPaymentMethod('cash')}
              />
              <PaymentToggle
                active={isPureDigital}
                disabled={!editable}
                icon={<Smartphone size={16} />}
                label="Venmo"
                onClick={() => switchPaymentMethod('digital')}
              />
              <PaymentToggle
                active={isSplit}
                disabled={!editable}
                icon={<Banknote size={16} />}
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
                    disabled={!editable}
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
                  disabled={!editable}
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
                    disabled={!editable}
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
                    disabled={!editable}
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
                    disabled={!editable}
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
        {overrideActive && discount > 0 && editable && (
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
                Sale will be saved as pending and excluded from totals until you choose.
              </div>
            )}
          </section>
        )}

        {/* ============ PER-HOST BREAKDOWN ============ */}
        {/* Only shown when relevant — i.e. when there's a discount that affects the split */}
        {items.length > 0 && overrideActive && discount > 0 && (
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
        {items.length > 0 && (
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

        {enteredByHost && (
          <div className="text-[11px] text-muted text-center pt-2">
            Entered by {enteredByHost.name}
          </div>
        )}
      </main>

      {/* ============ ACTION BAR ============ */}
      {editable && (
        <div
          className="fixed bottom-0 left-0 right-0 px-4 pt-3 bg-white/95 backdrop-blur-xl border-t border-hairline flex gap-2"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          {isDraft && (
            <button onClick={discardDraft} className="btn-secondary flex-1">Discard</button>
          )}
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

      {/* ============ ITEM EDIT SHEET ============ */}
      {editingItem && (
        <ItemEditSheet
          item={editingItem}
          hosts={hosts}
          isNew={editingItem._isNew}
          onSave={saveItem}
          onDelete={deleteItem}
          onClose={() => setEditingItemId(null)}
        />
      )}
    </div>
  );
}

// ============================================================
// EMPTY STATE HERO
// ============================================================
function EmptyItemsHero({ disabled, onAdd, quickAdds, hosts, onQuickAdd, onRemoveQuickAdd }) {
  return (
    <div className="flex flex-col items-center gap-5 pt-6">
      <div className="card p-8 w-full flex flex-col items-center gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 text-accent-deep flex items-center justify-center">
          <ShoppingBag size={28} strokeWidth={1.6} />
        </div>
        <div>
          <h2 className="text-[18px] font-semibold">What are they buying?</h2>
          <p className="text-[13px] text-muted mt-1 max-w-xs">Add each item with its price and whose item it is.</p>
        </div>
        <button
          onClick={onAdd}
          disabled={disabled}
          className="btn-primary px-8 flex items-center gap-2 disabled:opacity-50"
        >
          <Plus size={20} /> Add item
        </button>
      </div>

      {quickAdds && quickAdds.length > 0 && onQuickAdd && (
        <QuickAddStrip
          quickAdds={quickAdds}
          hosts={hosts}
          onTap={onQuickAdd}
          onRemove={onRemoveQuickAdd}
          title="Or use a quick add"
        />
      )}
    </div>
  );
}

// ============================================================
// ITEM SUMMARY ROW (read-only, tap to edit)
// ============================================================
function ItemSummaryRow({ item, host, onTap }) {
  const subtotal = (item.qty || 0) * (item.unitPrice || 0);
  const Wrapper = onTap ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onTap}
      className={`card p-4 flex items-center gap-3 text-left ${onTap ? 'active:opacity-70' : ''}`}
    >
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[16px] truncate">
          {(item.qty || 1) > 1 && <span className="text-muted">{item.qty} × </span>}
          {item.name || <span className="text-muted italic font-normal">Untitled</span>}
        </div>
        <div className="text-[12px] text-muted">
          {host?.name || 'No host'}
          {item.saveForQuickAdd && <span className="ml-2 text-amber-600">★ saving</span>}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-bold tabular-nums text-[16px]">{formatMoney(subtotal)}</div>
        {(item.qty || 1) > 1 && (
          <div className="text-[11px] text-muted tabular-nums">{formatMoney(item.unitPrice)} ea</div>
        )}
      </div>
      {onTap && <Pencil size={14} className="text-muted shrink-0" />}
    </Wrapper>
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
// ITEM EDIT SHEET
// ============================================================
function ItemEditSheet({ item, hosts, isNew, onSave, onDelete, onClose }) {
  const [name, setName] = useState(item.name);
  const [qty, setQty] = useState(item.qty);
  const [priceStr, setPriceStr] = useState(((item.unitPrice || 0) / 100).toFixed(2));
  const [hostId, setHostId] = useState(item.hostId || '');
  const [saveForQuickAdd, setSaveForQuickAdd] = useState(!!item.saveForQuickAdd);

  const submit = () => {
    onSave({
      ...item,
      name: name.trim(),
      qty: Math.max(1, Number(qty) || 1),
      unitPrice: parseMoney(priceStr) ?? 0,
      hostId,
      saveForQuickAdd
    });
  };

  const canSave = name.trim() && hostId;

  return (
    <div className="fixed inset-0 z-30 flex items-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative w-full bg-white rounded-t-3xl shadow-sheet p-5 flex flex-col gap-4 max-h-[92vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
      >
        <div className="w-10 h-1 rounded-full bg-hairline mx-auto -mt-2" />
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-bold">{isNew ? 'New item' : 'Edit item'}</h2>
          <button onClick={onClose} aria-label="Close" className="p-2 -mr-2 text-muted active:opacity-60">
            <X size={22} />
          </button>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[12px] uppercase tracking-wide text-muted">What is it?</span>
          <input
            className="input"
            placeholder="e.g. lamp"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>

        <div className="flex gap-2">
          <label className="flex flex-col gap-1 w-24">
            <span className="text-[12px] uppercase tracking-wide text-muted">Qty</span>
            <input
              className="input text-center"
              type="text"
              inputMode="numeric"
              value={qty}
              onFocus={(e) => { try { e.target.select(); } catch {} }}
              onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </label>
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-[12px] uppercase tracking-wide text-muted">Price each</span>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none">$</span>
              <MoneyInput
                className="input pl-7 text-right tabular-nums"
                value={priceStr}
                onChange={setPriceStr}
              />
            </div>
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[12px] uppercase tracking-wide text-muted">Whose item?</span>
          <select
            className="input"
            value={hostId}
            onChange={(e) => setHostId(e.target.value)}
          >
            <option value="" disabled>Pick a host</option>
            {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </label>

        <label className="flex items-center gap-3 cursor-pointer select-none py-1">
          <input
            type="checkbox"
            checked={saveForQuickAdd}
            onChange={(e) => setSaveForQuickAdd(e.target.checked)}
            className="w-5 h-5 rounded accent-amber-500"
          />
          <span className="text-[14px]">Save this item to quick-add for later</span>
        </label>

        <div className="flex gap-2 pt-2">
          {!isNew && (
            <button
              onClick={() => onDelete(item.id)}
              className="rounded-2xl border border-red-200 text-red-600 font-semibold py-3.5 px-5 active:opacity-60"
            >
              <Trash2 size={18} className="inline" />
            </button>
          )}
          <button
            onClick={submit}
            disabled={!canSave}
            className="btn-primary flex-1"
          >
            {isNew ? 'Add to sale' : 'Save'}
          </button>
        </div>
      </div>
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
        body="Save now, come back to this. Sale won't be in the totals yet."
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
function PaymentToggle({ active, disabled, icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-2 rounded-2xl py-3 font-semibold text-[14px] active:opacity-80 disabled:opacity-50 ${
        active
          ? 'bg-accent text-white border-2 border-accent'
          : 'bg-white text-ink border-2 border-hairline'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function CompleteButton({ disabled, cashShort, splitMismatch, saveAsDraft, willBePending, shortBy, onClick }) {
  let label = 'Complete sale';
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
