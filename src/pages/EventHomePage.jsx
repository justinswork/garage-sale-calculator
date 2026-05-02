import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, AlertTriangle, Share2, Pencil, Wallet, X, Tag, Users, ChevronDown, ArrowRight, Smartphone, Banknote, Lock, Check } from 'lucide-react';
import HostPill, { HostDot } from '../components/HostPill.jsx';
import MoneyInput from '../components/MoneyInput.jsx';
import { paymentColor } from '../utils/colors.js';
import { useEvent } from '../contexts/EventContext.jsx';
import { createSale } from '../data/sales.js';
import { setDailyStartingCash, clearDailyStartingCash } from '../data/events.js';
import EventHeader from '../components/EventHeader.jsx';
import { formatMoney, parseMoney } from '../utils/money.js';
import { localDayKey, formatDayLabel, formatTime } from '../utils/dates.js';
import { resolvePerHost, isPending, effectiveTotal, computeSettleUp, applySettlements, getCashAmount } from '../utils/sale.js';
import { recordSettlement, unrecordSettlement } from '../data/settlements.js';

export default function EventHomePage() {
  const { event, hosts, sales, saleNumberMap, settlements, currentHost, uid } = useEvent();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState('all');

  const hostName = (id) => hosts.find((h) => h.id === id)?.name || 'Unknown';

  const { liveSales, drafts, pendingCount } = useMemo(() => {
    const live = [];
    const drafts = [];
    let pending = 0;
    for (const s of sales) {
      if (s.deletedAt) continue;
      if (s.status === 'draft') drafts.push(s);
      else if (s.status === 'completed' || s.status === 'pending-discount') {
        live.push(s);
        if (isPending(s)) pending++;
      }
    }
    return { liveSales: live, drafts, pendingCount: pending };
  }, [sales]);

  const totals = useMemo(() => computeTotals(liveSales, hosts), [liveSales, hosts]);
  const hasActivity = liveSales.length > 0 || drafts.length > 0;

  const daysToShow = useMemo(() => {
    const todayKey = localDayKey(new Date());
    const list = totals.byDay;
    if (list.some((d) => d.dayKey === todayKey)) return list;
    return [
      { dayKey: todayKey, total: 0, sales: [] },
      ...list
    ];
  }, [totals.byDay]);

  const startSale = async () => {
    setCreating(true);
    try {
      const saleId = await createSale(event.id, { uid, hostId: currentHost.id });
      navigate(`/e/${event.id}/sale/${saleId}`);
    } finally {
      setCreating(false);
    }
  };

  const share = async () => {
    const url = `${window.location.origin}/e/${event.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: event.name, url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {}
  };

  return (
    <div className="min-h-screen flex flex-col bg-canvas pb-28">
      <EventHeader rightSlot={
        <button onClick={share} className="p-2 -mr-1 text-muted active:opacity-60" aria-label="Share event">
          <Share2 size={20} />
        </button>
      } />

      <main className="flex-1 px-4 py-4 flex flex-col gap-4">
        {event.status === 'closed' && (
          <Link
            to={`/e/${event.id}/settings`}
            className="card p-3 bg-slate-100 border border-slate-200 flex items-center gap-2 active:opacity-70"
          >
            <Lock size={16} className="text-slate-700 shrink-0" />
            <span className="text-[13px] text-slate-700 flex-1">
              Event closed. Reopen in settings to make changes.
            </span>
          </Link>
        )}
        {!hasActivity ? (
          <WelcomeHero
            event={event}
            hosts={hosts}
            todayCash={event.dailyStartingCash?.[localDayKey(new Date())]}
            onShare={share}
          />
        ) : (
          <>
            <div className="card p-5 flex flex-col gap-1">
              <div className="text-[44px] font-bold leading-none tracking-tight tabular-nums">
                {formatMoney(totals.grand)}
              </div>
              <div className="text-[13px] text-muted">
                {totals.completedCount} sale{totals.completedCount === 1 ? '' : 's'}
                {hosts.length > 1 && (
                  <> · <span className="text-ink font-medium">{formatMoney(totals.perHost[currentHost.id] || 0)}</span> is yours</>
                )}
              </div>
              {pendingCount > 0 && (
                <Link
                  to={`/e/${event.id}#pending`}
                  className="self-start mt-2 flex items-center gap-1 text-amber-700 bg-amber-50 rounded-full px-3 py-1 text-[12px] active:opacity-70"
                >
                  <AlertTriangle size={12} />
                  {pendingCount} pending · {formatMoney(totals.pendingValue)}
                </Link>
              )}
            </div>

            {hosts.length > 1 && (
              <div className="card p-2 flex flex-col">
                {hosts.map((h) => (
                  <Link
                    key={h.id}
                    to={`/e/${event.id}/hosts/${h.id}`}
                    className="flex items-center justify-between gap-3 px-2 py-2 rounded-xl active:bg-canvas"
                  >
                    <HostPill host={h} hosts={hosts} you={h.id === currentHost.id} />
                    <span className="flex items-center gap-1.5">
                      <span className="font-semibold tabular-nums text-[14px]">{formatMoney(totals.perHost[h.id] || 0)}</span>
                      <ArrowRight size={12} className="text-muted" />
                    </span>
                  </Link>
                ))}
              </div>
            )}

            {drafts.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="text-[12px] uppercase tracking-wide text-muted px-2">In progress</h3>
                {drafts.map((s) => (
                  <SaleRow key={s.id} sale={s} eventId={event.id} hostName={hostName} hosts={hosts} saleNumber={saleNumberMap[s.id]} />
                ))}
              </section>
            )}

            <div className="flex items-center justify-between px-2 -mb-1">
              <h3 className="text-[12px] uppercase tracking-wide text-muted">Sales log</h3>
              <PaymentFilterDropdown value={paymentFilter} onChange={setPaymentFilter} />
            </div>

            {daysToShow.map((day, idx) => (
              <DaySection
                key={day.dayKey}
                day={day}
                hosts={hosts}
                eventId={event.id}
                hostName={hostName}
                startingCash={event.dailyStartingCash?.[day.dayKey]}
                defaultOpen={idx === 0}
                disabled={event.status === 'closed'}
                paymentFilter={paymentFilter}
                saleNumberMap={saleNumberMap}
                settlements={settlements}
                uid={uid}
                currentHost={currentHost}
              />
            ))}

            <SettleUpCard
              sales={liveSales}
              hosts={hosts}
              settlements={settlements}
              eventId={event.id}
              uid={uid}
              currentHost={currentHost}
              saleNumberMap={saleNumberMap}
              disabled={event.status === 'closed'}
            />

            <PaidSettlements
              settlements={settlements}
              hosts={hosts}
              eventId={event.id}
              disabled={event.status === 'closed'}
            />

            <div className="flex justify-center gap-3 pt-4 text-[13px] text-muted">
              <Link to={`/e/${event.id}/report`} className="active:opacity-60">View report</Link>
              <span>·</span>
              <Link to={`/e/${event.id}/audit`} className="active:opacity-60">Audit log</Link>
            </div>
          </>
        )}

        {copied && (
          <div className="fixed top-16 left-0 right-0 flex justify-center pointer-events-none">
            <div className="bg-ink text-white text-[12px] rounded-full px-3 py-1.5">Link copied</div>
          </div>
        )}
      </main>

      {event.status !== 'closed' && (
        <button
          onClick={startSale}
          disabled={creating}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 btn-primary shadow-card flex items-center gap-2 px-6"
          style={{ paddingBottom: 'calc(0.875rem + env(safe-area-inset-bottom))' }}
        >
          <Plus size={20} /> {creating ? 'Starting…' : 'New sale'}
        </button>
      )}
    </div>
  );
}

function SaleRow({ sale, eventId, hostName, hosts, saleNumber }) {
  const pending = isPending(sale);
  const total = effectiveTotal(sale);
  const time = sale.createdAt?.toDate ? sale.createdAt.toDate() : new Date();
  const itemCount = sale.items?.length || 0;
  const itemsLabel = `${itemCount} item${itemCount === 1 ? '' : 's'}`;
  const negotiated = sale.overrideTotal != null && sale.overrideTotal !== sale.itemsSubtotal;
  const itemHostIds = [...new Set((sale.items || []).map((it) => it.hostId).filter(Boolean))];
  const itemHosts = itemHostIds.map((id) => hosts?.find((h) => h.id === id)).filter(Boolean);
  const method = sale.paymentMethod || 'cash';
  const c = paymentColor(method);
  const Icon = method === 'digital' ? Smartphone : method === 'split' ? Wallet : Banknote;
  return (
    <Link
      to={`/e/${eventId}/sale/${sale.id}`}
      className="card p-3 flex items-center gap-3 active:opacity-70"
    >
      <div className={`w-10 h-10 rounded-xl ${c.bg} ${c.icon} flex items-center justify-center shrink-0`} aria-label={c.label}>
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[15px] truncate">
          {saleNumber ? <span className="text-muted font-medium">#{saleNumber} · </span> : null}
          {itemsLabel}
          {sale.notes && (
            <span className="text-muted font-normal"> · {sale.notes.slice(0, 30)}{sale.notes.length > 30 ? '…' : ''}</span>
          )}
        </div>
        <div className="text-[12px] text-muted truncate flex items-center gap-1.5">
          <span>{formatTime(time)}</span>
          {itemHosts.length > 0 ? (
            itemHosts.map((h, i) => (
              <span key={h.id} className="flex items-center gap-1">
                <span>·</span>
                <HostDot host={h} hosts={hosts} />
                <span>{h.name}</span>
              </span>
            ))
          ) : (
            <span>· {hostName(sale.enteredByHostId)}</span>
          )}
          {negotiated && <span>· negotiated</span>}
        </div>
      </div>
      <div className="flex flex-col items-end shrink-0">
        <span className="font-bold tabular-nums text-[15px]">{formatMoney(total)}</span>
        {sale.status === 'draft' && (
          <span className="text-[10px] font-bold text-amber-700 mt-0.5">DRAFT</span>
        )}
        {pending && (
          <span className="text-[10px] font-bold text-amber-700 mt-0.5 flex items-center gap-0.5">
            <AlertTriangle size={10} /> PENDING
          </span>
        )}
      </div>
    </Link>
  );
}

function WelcomeHero({ event, hosts, todayCash, onShare }) {
  const todayKey = localDayKey(new Date());
  return (
    <div className="flex flex-col items-center gap-5 pt-6">
      <div className="card p-8 w-full flex flex-col items-center gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 text-accent-deep flex items-center justify-center">
          <Tag size={28} strokeWidth={1.6} />
        </div>
        <div>
          <h2 className="text-[20px] font-semibold">{event.name}</h2>
          <p className="text-[13px] text-muted mt-1 max-w-xs">
            Ready when you are. Hit <span className="font-semibold text-ink">+ New sale</span> below to log your first transaction.
          </p>
        </div>
      </div>

      <div className="w-full flex flex-col gap-2">
        <div className="text-[11px] uppercase tracking-wide text-muted px-2">Setup</div>
        <button
          onClick={onShare}
          className="card p-4 flex items-center gap-3 active:opacity-70 text-left"
        >
          <div className="w-9 h-9 rounded-xl bg-accent/10 text-accent-deep flex items-center justify-center shrink-0">
            <Users size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[14px]">Invite co-hosts</div>
            <div className="text-[12px] text-muted">
              {hosts.length === 1 ? 'Just you so far — share the event link.' : `${hosts.length} hosts on this event.`}
            </div>
          </div>
        </button>

        <DayCashHeader
          eventId={event.id}
          dayKey={todayKey}
          startingCash={todayCash}
          daySales={0}
          variant="hero"
        />
      </div>
    </div>
  );
}

function DaySection({ day, hosts, eventId, hostName, startingCash, defaultOpen, disabled, paymentFilter, saleNumberMap, settlements, uid, currentHost }) {
  const filtered = paymentFilter === 'all'
    ? day.sales
    : day.sales.filter((s) => (s.paymentMethod || 'cash') === paymentFilter);
  return (
    <details open={defaultOpen} className="flex flex-col gap-2 group">
      <summary className="flex items-center justify-between px-2 py-1 cursor-pointer list-none active:opacity-60">
        <div className="flex items-center gap-1.5">
          <ChevronDown
            size={14}
            className="text-muted transition-transform -rotate-90 group-open:rotate-0"
          />
          <h3 className="text-[13px] font-semibold">{formatDayLabel(day.dayKey)}</h3>
        </div>
        <div className="flex items-center gap-2 text-[13px] tabular-nums">
          {day.sales.length > 0 && (
            <span className="text-muted font-semibold">{formatMoney(day.total)}</span>
          )}
          <span className="text-[11px] text-muted">
            {day.sales.length} sale{day.sales.length === 1 ? '' : 's'}
          </span>
        </div>
      </summary>
      <div className="flex flex-col gap-2">
        <CashStatusInline
          eventId={eventId}
          dayKey={day.dayKey}
          startingCash={startingCash}
          dayCashSales={day.cashTotal}
          disabled={disabled}
        />
        {filtered.length === 0 && day.sales.length > 0 ? (
          <div className="card p-3 text-center text-[12px] text-muted">
            No matching sales for this filter.
          </div>
        ) : (
          filtered.map((s) => (
            <SaleRow key={s.id} sale={s} eventId={eventId} hostName={hostName} hosts={hosts} saleNumber={saleNumberMap?.[s.id]} />
          ))
        )}
      </div>
    </details>
  );
}

function PaymentFilterDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (!e.target.closest('[data-payment-filter]')) setOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [open]);

  const options = [
    { value: 'all', label: 'All payments', icon: null, color: null },
    { value: 'cash', label: 'Cash', icon: Banknote, color: paymentColor('cash') },
    { value: 'digital', label: 'Venmo', icon: Smartphone, color: paymentColor('digital') },
    { value: 'split', label: 'Split', icon: Wallet, color: paymentColor('split') }
  ];
  const current = options.find((o) => o.value === value) || options[0];
  const CurrentIcon = current.icon;

  return (
    <div className="relative" data-payment-filter>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[12px] bg-white border border-hairline rounded-full px-3 py-1.5 active:opacity-60"
      >
        {CurrentIcon ? (
          <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full ${current.color.bg} ${current.color.icon}`}>
            <CurrentIcon size={10} />
          </span>
        ) : (
          <span className="text-muted">Show:</span>
        )}
        <span className="font-medium">{current.label}</span>
        <ChevronDown size={12} className="text-muted" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 card overflow-hidden flex flex-col min-w-[180px] shadow-card">
          {options.map((o) => {
            const Icon = o.icon;
            const active = o.value === value;
            return (
              <button
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`flex items-center gap-2.5 px-3 py-2.5 text-[14px] active:opacity-60 ${
                  active ? 'bg-accent/10 text-accent-deep font-semibold' : ''
                }`}
              >
                {Icon ? (
                  <span className={`w-7 h-7 rounded-lg ${o.color.bg} ${o.color.icon} flex items-center justify-center shrink-0`}>
                    <Icon size={14} />
                  </span>
                ) : (
                  <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0 text-[10px] font-bold">
                    ALL
                  </span>
                )}
                <span className="flex-1 text-left">{o.label}</span>
                {active && <Check size={14} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SettleUpCard({ sales, hosts, settlements, eventId, uid, currentHost, saleNumberMap, disabled }) {
  const data = useMemo(() => computeSettleUp(sales, hosts), [sales, hosts]);
  if (data.totalDigital === 0) return null;

  // Filter settlements to those between hosts that have raw debts in this scope.
  const relevantSettlements = (settlements || []).filter((s) =>
    data.pairwiseDebts.some((d) => d.from === s.from && d.to === s.to)
  );
  const remaining = applySettlements(data.pairwiseDebts, relevantSettlements);
  const hasOpen = remaining.length > 0;

  // Per-host settlement adjustments by payment method. Cash settlements adjust
  // the cash column; digital settlements adjust the Venmo column. Legacy
  // settlements without a paymentMethod field default to digital.
  const cashAdj = {};
  const venmoAdj = {};
  for (const h of hosts) { cashAdj[h.id] = 0; venmoAdj[h.id] = 0; }
  for (const s of relevantSettlements) {
    const target = s.paymentMethod === 'cash' ? cashAdj : venmoAdj;
    if (target[s.to] != null) target[s.to] += s.amount;
    if (target[s.from] != null) target[s.from] -= s.amount;
  }

  return (
    <details className="card group" open={hasOpen}>
      <summary className="cursor-pointer list-none p-4 flex items-center justify-between active:opacity-70">
        <span className="font-semibold text-[14px] flex items-center gap-2">
          <Smartphone size={16} className="text-muted" />
          Settle up
        </span>
        <span className="text-[12px] text-muted flex items-center gap-2">
          {hasOpen ? `${remaining.length} open` : 'all settled'}
          <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="px-4 pb-4 pt-0 flex flex-col gap-3 border-t border-hairline mt-1">
        {hasOpen ? (
          <div className="flex flex-col gap-2 pt-3">
            {remaining.map((d, i) => (
              <DebtRow
                key={`${d.from}|${d.to}`}
                debt={d}
                hosts={hosts}
                eventId={eventId}
                saleNumberMap={saleNumberMap}
                currentHost={currentHost}
                uid={uid}
                disabled={disabled}
              />
            ))}
          </div>
        ) : (
          <div className="text-[12px] text-muted pt-3">All Venmo balances settled.</div>
        )}
        <div className="border-t border-hairline pt-3 flex flex-col gap-2 text-[12px] text-muted">
          {hosts.map((h) => {
            const p = data.perHost[h.id];
            const cAdj = cashAdj[h.id] || 0;
            const vAdj = venmoAdj[h.id] || 0;
            if (!p || (p.earned === 0 && p.digitalReceived === 0 && cAdj === 0 && vAdj === 0)) return null;
            const cashNow = p.cashEarned + cAdj;
            const venmoNow = p.digitalReceived + vAdj;
            return (
              <div key={h.id} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-ink">
                  <HostDot host={h} hosts={hosts} />
                  {h.name}
                </span>
                <span className="tabular-nums">
                  earned {formatMoney(p.earned)} · cash {formatMoney(cashNow)} · Venmo {formatMoney(venmoNow)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </details>
  );
}

function DebtRow({ debt, hosts, eventId, saleNumberMap, currentHost, uid, disabled }) {
  const [showSales, setShowSales] = useState(false);
  const [busy, setBusy] = useState(false);
  const fromHost = hosts.find((h) => h.id === debt.from);
  const toHost = hosts.find((h) => h.id === debt.to);
  if (!fromHost || !toHost) return null;

  const markPaid = async (paymentMethod) => {
    if (disabled || busy) return;
    setBusy(true);
    try {
      await recordSettlement(eventId, {
        from: debt.from,
        to: debt.to,
        amount: debt.amount,
        paymentMethod,
        byUid: uid
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl bg-canvas border border-hairline p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-[14px] flex-wrap">
        <HostPill host={fromHost} hosts={hosts} size="sm" />
        <span className="text-muted">owes</span>
        <HostPill host={toHost} hosts={hosts} size="sm" />
        <span className="ml-auto font-bold tabular-nums text-[16px]">{formatMoney(debt.amount)}</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); setShowSales((v) => !v); }}
          className="text-[12px] text-accent active:opacity-60"
        >
          {showSales ? 'Hide sales' : `Why? · ${debt.sales.length} sale${debt.sales.length === 1 ? '' : 's'}`}
        </button>
        {!disabled && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[11px] text-muted">Paid via</span>
            <button
              type="button"
              onClick={() => markPaid('cash')}
              disabled={busy}
              className="text-[12px] font-semibold rounded-full pl-1.5 pr-3 py-1 bg-emerald-100 text-emerald-700 active:opacity-70 disabled:opacity-50 flex items-center gap-1"
            >
              <Banknote size={14} /> Cash
            </button>
            <button
              type="button"
              onClick={() => markPaid('digital')}
              disabled={busy}
              className="text-[12px] font-semibold rounded-full pl-1.5 pr-3 py-1 bg-sky-100 text-sky-700 active:opacity-70 disabled:opacity-50 flex items-center gap-1"
            >
              <Smartphone size={14} /> Venmo
            </button>
          </div>
        )}
      </div>
      {showSales && (
        <div className="border-t border-hairline pt-2 flex flex-col gap-1.5">
          {debt.sales.map((s) => {
            const num = saleNumberMap?.[s.saleId];
            return (
              <Link
                key={s.saleId}
                to={`/e/${eventId}/sale/${s.saleId}`}
                className="flex items-center justify-between text-[12px] active:opacity-60"
              >
                <span className="text-accent">Sale {num ? `#${num}` : s.saleId.slice(0, 6)}</span>
                <span className="tabular-nums text-muted">{formatMoney(s.share)}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PaidSettlements({ settlements, hosts, eventId, disabled }) {
  if (!settlements || settlements.length === 0) return null;
  return (
    <details className="card group">
      <summary className="cursor-pointer list-none p-3 flex items-center justify-between text-[12px] text-muted active:opacity-70">
        <span>Recorded payments ({settlements.length})</span>
        <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-3 pb-3 flex flex-col gap-1.5 border-t border-hairline pt-2">
        {settlements.map((s) => {
          const fromHost = hosts.find((h) => h.id === s.from);
          const toHost = hosts.find((h) => h.id === s.to);
          if (!fromHost || !toHost) return null;
          const isCash = s.paymentMethod === 'cash';
          const c = paymentColor(isCash ? 'cash' : 'digital');
          const Icon = isCash ? Banknote : Smartphone;
          return (
            <div key={s.id} className="flex items-center gap-2 text-[12px]">
              <HostPill host={fromHost} hosts={hosts} size="sm" />
              <span className="text-muted">paid</span>
              <HostPill host={toHost} hosts={hosts} size="sm" />
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${c.bg} ${c.icon}`}>
                <Icon size={10} />
                {isCash ? 'cash' : 'Venmo'}
              </span>
              <span className="ml-auto tabular-nums font-semibold">{formatMoney(s.amount)}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => unrecordSettlement(eventId, s.id)}
                  className="text-muted active:opacity-60 p-1"
                  aria-label="Undo payment"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}

function CashStatusInline({ eventId, dayKey, startingCash, dayCashSales, disabled }) {
  const [editing, setEditing] = useState(false);
  const [str, setStr] = useState(startingCash != null ? (startingCash / 100).toFixed(2) : '');

  useEffect(() => {
    setStr(startingCash != null ? (startingCash / 100).toFixed(2) : '');
  }, [startingCash]);

  const save = async () => {
    const cents = parseMoney(str);
    if (cents == null) await clearDailyStartingCash(eventId, dayKey);
    else await setDailyStartingCash(eventId, dayKey, cents);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="px-3 flex items-center gap-2 text-[12px] text-muted">
        <Wallet size={12} />
        <span>Started with</span>
        <MoneyInput
          autoFocus
          value={str}
          onChange={setStr}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') setEditing(false);
          }}
          placeholder="0.00"
          className="w-20 rounded-lg bg-white border border-hairline px-2 py-1 outline-none focus:border-accent text-right tabular-nums"
        />
        <button onClick={() => setEditing(false)} className="text-muted active:opacity-60 p-1">
          <X size={12} />
        </button>
      </div>
    );
  }

  if (startingCash == null) {
    if (disabled) return null;
    return (
      <button
        onClick={() => setEditing(true)}
        className="self-start px-3 text-[12px] text-accent active:opacity-60"
      >
        + Set starting cash
      </button>
    );
  }

  const expected = startingCash + dayCashSales;
  if (disabled) {
    return (
      <div className="px-3 flex items-center gap-1 text-[12px] text-muted self-start">
        <Wallet size={12} />
        <span>Cash on hand: started <span className="text-ink font-medium tabular-nums">{formatMoney(startingCash)}</span> · now <span className="text-ink font-medium tabular-nums">{formatMoney(expected)}</span></span>
      </div>
    );
  }
  return (
    <button
      onClick={() => setEditing(true)}
      className="px-3 flex items-center gap-1 text-[12px] text-muted active:opacity-60 self-start"
    >
      <Wallet size={12} />
      <span>Cash on hand: started <span className="text-ink font-medium tabular-nums">{formatMoney(startingCash)}</span> · now <span className="text-ink font-medium tabular-nums">{formatMoney(expected)}</span></span>
      <Pencil size={10} className="ml-1" />
    </button>
  );
}

function DayCashHeader({ eventId, dayKey, startingCash, daySales, variant }) {
  const [editing, setEditing] = useState(false);
  const [str, setStr] = useState(startingCash != null ? (startingCash / 100).toFixed(2) : '');

  useEffect(() => {
    setStr(startingCash != null ? (startingCash / 100).toFixed(2) : '');
  }, [startingCash]);

  const save = async () => {
    const cents = parseMoney(str);
    if (cents == null) {
      await clearDailyStartingCash(eventId, dayKey);
    } else {
      await setDailyStartingCash(eventId, dayKey, cents);
    }
    setEditing(false);
  };

  const isHero = variant === 'hero';
  const expected = startingCash != null ? startingCash + daySales : null;

  if (editing) {
    return (
      <div className={`card p-3 flex items-center gap-2 ${isHero ? 'p-4' : ''}`}>
        <Wallet size={isHero ? 18 : 14} className="text-muted" />
        <span className="text-[13px] text-muted">Started with</span>
        <MoneyInput
          autoFocus
          value={str}
          onChange={setStr}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') setEditing(false);
          }}
          placeholder="0.00"
          className="flex-1 rounded-xl bg-white border border-hairline px-2 py-1.5 outline-none focus:border-accent text-right tabular-nums"
        />
        <button onClick={() => setEditing(false)} className="text-muted active:opacity-60 p-1" aria-label="Cancel">
          <X size={14} />
        </button>
      </div>
    );
  }

  if (isHero) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="card p-4 flex items-center gap-3 active:opacity-70 text-left"
      >
        <div className="w-9 h-9 rounded-xl bg-accent/10 text-accent-deep flex items-center justify-center shrink-0">
          <Wallet size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[14px]">Today's starting cash</div>
          <div className="text-[12px] text-muted">
            {startingCash == null
              ? 'Optional — tap to set the cash already in your pot.'
              : `Started with ${formatMoney(startingCash)} · cash on hand ${formatMoney(expected)}`}
          </div>
        </div>
        <Pencil size={14} className="text-muted shrink-0" />
      </button>
    );
  }

  if (startingCash == null) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="card p-3 flex items-center gap-2 text-muted text-[13px] active:opacity-70"
      >
        <Wallet size={14} />
        <span>Set starting cash for this day</span>
      </button>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="card p-3 flex items-center gap-2 text-[13px] active:opacity-70"
    >
      <Wallet size={14} className="text-muted shrink-0" />
      <span className="text-muted">Started with</span>
      <span className="font-semibold tabular-nums">{formatMoney(startingCash)}</span>
      <span className="text-muted">·</span>
      <span className="text-muted">cash on hand</span>
      <span className="font-semibold tabular-nums">{formatMoney(expected)}</span>
      <Pencil size={12} className="text-muted ml-auto" />
    </button>
  );
}

function computeTotals(sales, hosts) {
  const perHost = Object.fromEntries(hosts.map((h) => [h.id, 0]));
  const byDayMap = {};
  let grand = 0;
  let completedCount = 0;
  let pendingValue = 0;
  for (const s of sales) {
    const ts = s.createdAt?.toDate ? s.createdAt.toDate() : new Date();
    const key = localDayKey(ts);
    if (!byDayMap[key]) byDayMap[key] = { dayKey: key, total: 0, cashTotal: 0, sales: [] };
    byDayMap[key].sales.push(s);

    if (isPending(s)) {
      pendingValue += effectiveTotal(s);
      continue;
    }
    const allocation = s.discountAllocation;
    const finalPerHost = resolvePerHost(s.items, s.overrideTotal, allocation);
    if (!finalPerHost) continue;
    const total = effectiveTotal(s);
    grand += total;
    completedCount++;
    for (const [hid, amt] of Object.entries(finalPerHost)) {
      perHost[hid] = (perHost[hid] || 0) + amt;
    }
    byDayMap[key].total += total;
    byDayMap[key].cashTotal += getCashAmount(s);
  }
  const byDay = Object.values(byDayMap).sort((a, b) => (a.dayKey < b.dayKey ? 1 : -1));
  return { grand, perHost, byDay, completedCount, pendingValue };
}
