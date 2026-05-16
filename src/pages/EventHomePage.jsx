import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, AlertTriangle, Share2, Pencil, Wallet, X, Tag, Users, ChevronDown, ArrowRight, Smartphone, Banknote, Lock, Check, Calendar, MapPin, RefreshCw, Sparkles } from 'lucide-react';
import HostPill, { HostDot } from '../components/HostPill.jsx';
import MoneyInput from '../components/MoneyInput.jsx';
import { CashVsDigitalPie, CashVsDigitalBar } from '../components/CashVsDigital.jsx';
import { paymentColor } from '../utils/colors.js';
import { useEvent } from '../contexts/EventContext.jsx';
import { createSale } from '../data/sales.js';
import { isAtFreeLimit, FREE_SALE_LIMIT } from '../data/billing.js';
import UpgradeModal from '../components/UpgradeModal.jsx';
import { setDailyStartingCash, clearDailyStartingCash } from '../data/events.js';
import EventHeader from '../components/EventHeader.jsx';
import { formatMoney, parseMoney } from '../utils/money.js';
import { localDayKey, formatDayLabel, formatTime } from '../utils/dates.js';
import { resolvePerHost, isPending, effectiveTotal, computeSettleUp, applySettlements, getCashAmount, getDigitalAmount, applyDailyCashCarryover } from '../utils/sale.js';
import { recordSettlement, unrecordSettlement } from '../data/settlements.js';
import { recordAudit } from '../data/audit.js';

export default function EventHomePage() {
  const { event, hosts, sales, saleNumberMap, settlements, currentHost, uid } = useEvent();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradedToast, setUpgradedToast] = useState(false);

  // Stripe Checkout success-redirect carries ?upgraded=1. The webhook is
  // what actually flips event.purchased server-side, but the query param
  // is a hint that we should show a confirmation here. Strip it from the
  // URL so refresh doesn't re-trigger the toast.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('upgraded') === '1') {
      setUpgradedToast(true);
      params.delete('upgraded');
      const qs = params.toString();
      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`
      );
      const t = setTimeout(() => setUpgradedToast(false), 4000);
      return () => clearTimeout(t);
    }
  }, []);

  const atFreeLimit = isAtFreeLimit({ event, sales });

  const hostName = (id) => hosts.find((h) => h.id === id)?.name || 'Unknown';

  // Pull-to-refresh: only engages when the page is at scrollTop 0 and the
  // user drags down past the threshold. Just reloads the page — Firestore
  // subscriptions re-establish on mount, and a fresh load also picks up any
  // new service-worker code. Works reliably on installed Android PWAs;
  // iOS browser overscroll may visually interfere, but the threshold check
  // still fires and the explicit refresh button is the reliable fallback.
  const PULL_THRESHOLD = 70;
  const PULL_MAX = 120;
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullStartYRef = useRef(null);

  const refresh = () => {
    setRefreshing(true);
    window.location.reload();
  };

  const onTouchStart = (e) => {
    if (window.scrollY === 0 && !refreshing) {
      pullStartYRef.current = e.touches[0].clientY;
    } else {
      pullStartYRef.current = null;
    }
  };
  const onTouchMove = (e) => {
    if (pullStartYRef.current == null) return;
    const dy = e.touches[0].clientY - pullStartYRef.current;
    setPullY(dy > 0 ? Math.min(dy, PULL_MAX) : 0);
  };
  const onTouchEnd = () => {
    if (pullY > PULL_THRESHOLD) {
      refresh();
    } else {
      setPullY(0);
    }
    pullStartYRef.current = null;
  };

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
      { dayKey: todayKey, total: 0, cashTotal: 0, digitalTotal: 0, sales: [] },
      ...list
    ];
  }, [totals.byDay]);

  // Walk days chronologically once per render to resolve each day's
  // effective starting cash (explicit or carried over from the prior day's
  // ending cash). The carryover map is keyed by dayKey for O(1) lookup.
  const carryoverByDay = useMemo(() => {
    const ascending = [...daysToShow].sort((a, b) => (a.dayKey < b.dayKey ? -1 : 1));
    const augmented = applyDailyCashCarryover(event, ascending);
    return Object.fromEntries(augmented.map((d) => [
      d.dayKey,
      { effectiveStartingCash: d.effectiveStartingCash, isCarryover: d.isCarryover }
    ]));
  }, [daysToShow, event]);

  const startSale = async () => {
    // Free-tier guard: at the limit, prompt the user to upgrade instead of
    // creating an 11th transaction. Once event.purchased flips true the
    // live Firestore listener clears atFreeLimit and this guard short-
    // circuits, so they can proceed without a page reload.
    if (atFreeLimit) {
      setShowUpgrade(true);
      return;
    }
    setCreating(true);
    try {
      const saleId = await createSale(event.id, { uid, hostId: currentHost.id });
      recordAudit(event.id, {
        type: 'transaction.created',
        summary: `Started a new transaction`,
        byUid: uid,
        byHostId: currentHost.id,
        meta: { saleId }
      });
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
    <div
      className="min-h-screen flex flex-col bg-canvas pb-28"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <EventHeader rightSlot={
        <div className="flex items-center -mr-1">
          <button
            onClick={refresh}
            disabled={refreshing}
            className="p-2 text-muted active:opacity-60 disabled:opacity-40"
            aria-label="Refresh"
          >
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button onClick={share} className="p-2 text-muted active:opacity-60" aria-label="Share event">
            <Share2 size={20} />
          </button>
        </div>
      } />

      {(pullY > 0 || refreshing) && (
        <div
          className="overflow-hidden flex items-center justify-center text-muted text-[12px] gap-2 transition-[height] duration-150"
          style={{
            height: refreshing ? 44 : Math.round(pullY * 0.5),
            opacity: refreshing ? 1 : Math.min(pullY / PULL_THRESHOLD, 1)
          }}
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          <span>
            {refreshing
              ? 'Refreshing…'
              : pullY > PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}
          </span>
        </div>
      )}

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
        <EventDetailsSummary event={event} />

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
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-[44px] font-bold leading-none tracking-tight tabular-nums">
                    {formatMoney(totals.grand)}
                  </div>
                  <div className="text-[13px] text-muted mt-1">
                    {totals.completedCount} transaction{totals.completedCount === 1 ? '' : 's'}
                    {hosts.length > 1 && (
                      <> · <span className="text-ink font-medium">{formatMoney(totals.perHost[currentHost.id] || 0)}</span> is yours</>
                    )}
                  </div>
                </div>
                <CashVsDigitalPie cash={totals.grandCash} digital={totals.grandDigital} />
              </div>
              {(totals.grandCash > 0 || totals.grandDigital > 0) && (
                <div className="flex items-center gap-3 text-[12px] mt-2 flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-700" />
                    <span className="text-muted">Cash</span>
                    <span className="font-semibold tabular-nums">{formatMoney(totals.grandCash)}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-700" />
                    <span className="text-muted">Venmo</span>
                    <span className="font-semibold tabular-nums">{formatMoney(totals.grandDigital)}</span>
                  </span>
                </div>
              )}
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
              <h3 className="text-[12px] uppercase tracking-wide text-muted">Transactions</h3>
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
                effectiveStartingCash={carryoverByDay[day.dayKey]?.effectiveStartingCash ?? 0}
                isCarryover={carryoverByDay[day.dayKey]?.isCarryover ?? false}
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
              uid={uid}
              currentHost={currentHost}
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

        {upgradedToast && (
          <div className="fixed top-16 left-0 right-0 flex justify-center pointer-events-none z-40 px-4">
            <div className="bg-emerald-700 text-white text-[13px] font-semibold rounded-full px-4 py-2 shadow-card flex items-center gap-2">
              <Check size={16} /> Event unlocked — record as many transactions as you want!
            </div>
          </div>
        )}
      </main>

      {event.status !== 'closed' && (
        <>
          {!event.purchased && atFreeLimit && (
            <div
              className="fixed bottom-[4.5rem] left-1/2 -translate-x-1/2 bg-amber-100 text-amber-800 text-[11px] rounded-full px-3 py-1 flex items-center gap-1.5 shadow-card pointer-events-none"
              style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
            >
              <AlertTriangle size={11} /> Free limit reached — {FREE_SALE_LIMIT} of {FREE_SALE_LIMIT} transactions used
            </div>
          )}
          <button
            onClick={startSale}
            disabled={creating}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 btn-primary shadow-card flex items-center gap-2 px-6"
            style={{ paddingBottom: 'calc(0.875rem + env(safe-area-inset-bottom))' }}
          >
            {atFreeLimit ? (
              <><Sparkles size={20} /> Unlock for $5</>
            ) : (
              <><Plus size={20} /> {creating ? 'Starting…' : 'New transaction'}</>
            )}
          </button>
        </>
      )}

      <UpgradeModal
        eventId={event.id}
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
      />
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

function EventDetailsSummary({ event }) {
  const start = event.startDate;
  const end = event.endDate;
  const location = event.location?.trim();
  const notes = event.notes?.trim();
  const hasAny = start || end || location || notes;

  const dateLabel = (() => {
    if (!start && !end) return null;
    if (start && end && start !== end) return `${formatDayLabel(start)} – ${formatDayLabel(end)}`;
    if (start) return formatDayLabel(start);
    return formatDayLabel(end);
  })();

  if (!hasAny) {
    return (
      <Link
        to={`/e/${event.id}/settings`}
        className="card p-3 flex items-center gap-2 text-[12px] text-muted active:opacity-70"
      >
        <Pencil size={14} />
        <span>Add dates, location, or other details</span>
      </Link>
    );
  }

  return (
    <Link
      to={`/e/${event.id}/settings`}
      className="card p-3 flex flex-col gap-1 text-[13px] active:opacity-70"
    >
      <div className="flex items-center gap-3 flex-wrap">
        {dateLabel && (
          <span className="flex items-center gap-1.5">
            <Calendar size={13} className="text-muted shrink-0" />
            <span>{dateLabel}</span>
          </span>
        )}
        {location && (
          <span className="flex items-center gap-1.5 min-w-0">
            <MapPin size={13} className="text-muted shrink-0" />
            <span className="truncate">{location}</span>
          </span>
        )}
      </div>
      {notes && (
        <div className="text-[12px] text-muted whitespace-pre-line line-clamp-2">{notes}</div>
      )}
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
            Ready when you are. Hit <span className="font-semibold text-ink">+ New transaction</span> below to log your first one.
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

function DaySection({ day, hosts, eventId, hostName, startingCash, effectiveStartingCash, isCarryover, defaultOpen, disabled, paymentFilter, saleNumberMap, settlements, uid, currentHost }) {
  const filtered = paymentFilter === 'all'
    ? day.sales
    : day.sales.filter((s) => (s.paymentMethod || 'cash') === paymentFilter);
  return (
    <details open={defaultOpen} className="flex flex-col gap-2 group">
      <summary className="flex flex-col gap-1.5 px-2 py-1 cursor-pointer list-none active:opacity-60">
        <div className="flex items-center justify-between">
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
        </div>
        <CashVsDigitalBar cash={day.cashTotal} digital={day.digitalTotal} />
        {(day.cashTotal > 0 || day.digitalTotal > 0) && (
          <div className="flex items-center gap-3 text-[11px] text-muted tabular-nums">
            {day.cashTotal > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-700" />
                {formatMoney(day.cashTotal)} cash
              </span>
            )}
            {day.digitalTotal > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-sky-700" />
                {formatMoney(day.digitalTotal)} Venmo
              </span>
            )}
          </div>
        )}
      </summary>
      <div className="flex flex-col gap-2">
        <CashStatusInline
          eventId={eventId}
          dayKey={day.dayKey}
          startingCash={startingCash}
          effectiveStartingCash={effectiveStartingCash}
          isCarryover={isCarryover}
          dayCashSales={day.cashTotal}
          disabled={disabled}
          uid={uid}
          currentHost={currentHost}
        />
        {filtered.length === 0 && day.sales.length > 0 ? (
          <div className="card p-3 text-center text-[12px] text-muted">
            No matching transactions for this filter.
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
      recordAudit(eventId, {
        type: 'settlement.recorded',
        summary: `${fromHost.name} paid ${toHost.name} ${formatMoney(debt.amount)} via ${paymentMethod === 'cash' ? 'cash' : 'Venmo'}`,
        byUid: uid,
        byHostId: currentHost?.id || null,
        meta: { from: debt.from, to: debt.to, amount: debt.amount, paymentMethod }
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
          {showSales ? 'Hide transactions' : `Why? · ${debt.sales.length} transaction${debt.sales.length === 1 ? '' : 's'}`}
        </button>
      </div>
      {!disabled && (
        <div className="flex flex-col gap-1.5 pt-1">
          <span className="text-[12px] text-muted">How was this paid?</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => markPaid('cash')}
              disabled={busy}
              className="flex-1 text-[13px] font-semibold rounded-xl px-3 py-2.5 bg-emerald-100 text-emerald-800 border border-emerald-200 active:bg-emerald-200 active:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <Banknote size={16} /> Paid in cash
            </button>
            <button
              type="button"
              onClick={() => markPaid('digital')}
              disabled={busy}
              className="flex-1 text-[13px] font-semibold rounded-xl px-3 py-2.5 bg-sky-100 text-sky-800 border border-sky-200 active:bg-sky-200 active:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <Smartphone size={16} /> Paid via Venmo
            </button>
          </div>
        </div>
      )}
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
                <span className="text-accent">Transaction {num ? `#${num}` : s.saleId.slice(0, 6)}</span>
                <span className="tabular-nums text-muted">{formatMoney(s.share)}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PaidSettlements({ settlements, hosts, eventId, disabled, uid, currentHost }) {
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
                  onClick={async () => {
                    await unrecordSettlement(eventId, s.id);
                    recordAudit(eventId, {
                      type: 'settlement.undone',
                      summary: `Undid: ${fromHost.name} paid ${toHost.name} ${formatMoney(s.amount)} (${isCash ? 'cash' : 'Venmo'})`,
                      byUid: uid,
                      byHostId: currentHost?.id || null,
                      meta: { from: s.from, to: s.to, amount: s.amount, paymentMethod: s.paymentMethod }
                    });
                  }}
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

function CashStatusInline({ eventId, dayKey, startingCash, effectiveStartingCash, isCarryover, dayCashSales, disabled, uid, currentHost }) {
  const [editing, setEditing] = useState(false);
  // When opening the editor, prefill with the effective starting cash (the
  // carried-over value if no explicit value is set) so the user can either
  // accept it or override it.
  const initialStr = (() => {
    if (startingCash != null) return (startingCash / 100).toFixed(2);
    if (isCarryover) return (effectiveStartingCash / 100).toFixed(2);
    return '';
  })();
  const [str, setStr] = useState(initialStr);

  useEffect(() => {
    if (startingCash != null) {
      setStr((startingCash / 100).toFixed(2));
    } else if (isCarryover) {
      setStr((effectiveStartingCash / 100).toFixed(2));
    } else {
      setStr('');
    }
  }, [startingCash, effectiveStartingCash, isCarryover]);

  const save = async () => {
    const cents = parseMoney(str);
    const dayLabel = formatDayLabel(dayKey);
    if (cents == null) {
      await clearDailyStartingCash(eventId, dayKey);
      if (startingCash != null) {
        recordAudit(eventId, {
          type: 'daycash.cleared',
          summary: `Cleared starting cash for ${dayLabel}`,
          byUid: uid,
          byHostId: currentHost?.id || null,
          meta: { dayKey, previous: startingCash }
        });
      }
    } else if (cents !== startingCash) {
      await setDailyStartingCash(eventId, dayKey, cents);
      // When the user is overriding a carried-over value, capture the
      // carryover context in the audit so it's clear they made a manual
      // decision against the default.
      const meta = { dayKey, amount: cents, previous: startingCash };
      if (startingCash == null && isCarryover) {
        meta.previousCarriedOver = effectiveStartingCash;
      }
      recordAudit(eventId, {
        type: 'daycash.set',
        summary: `Set starting cash for ${dayLabel} to ${formatMoney(cents)}`,
        byUid: uid,
        byHostId: currentHost?.id || null,
        meta
      });
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="px-3 flex items-center gap-2 text-[12px] text-muted flex-wrap">
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

  // First day with no value and no prior carryover available — show the
  // original "+ Set starting cash" call-to-action.
  if (startingCash == null && !isCarryover) {
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

  const displayedStart = startingCash != null ? startingCash : effectiveStartingCash;
  const expected = displayedStart + dayCashSales;
  const carryoverHint = isCarryover ? <span className="text-[11px] text-muted/80 italic"> (from previous day)</span> : null;
  if (disabled) {
    return (
      <div className="px-3 flex items-center gap-1 text-[12px] text-muted self-start flex-wrap">
        <Wallet size={12} />
        <span>Cash on hand: started <span className="text-ink font-medium tabular-nums">{formatMoney(displayedStart)}</span>{carryoverHint} · now <span className="text-ink font-medium tabular-nums">{formatMoney(expected)}</span></span>
      </div>
    );
  }
  return (
    <button
      onClick={() => setEditing(true)}
      className="px-3 flex items-center gap-1 text-[12px] text-muted active:opacity-60 self-start flex-wrap text-left"
    >
      <Wallet size={12} />
      <span>Cash on hand: started <span className="text-ink font-medium tabular-nums">{formatMoney(displayedStart)}</span>{carryoverHint} · now <span className="text-ink font-medium tabular-nums">{formatMoney(expected)}</span></span>
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
  let grandCash = 0;
  let grandDigital = 0;
  let completedCount = 0;
  let pendingValue = 0;
  for (const s of sales) {
    const ts = s.createdAt?.toDate ? s.createdAt.toDate() : new Date();
    const key = localDayKey(ts);
    if (!byDayMap[key]) byDayMap[key] = { dayKey: key, total: 0, cashTotal: 0, digitalTotal: 0, sales: [] };
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
    const cash = getCashAmount(s);
    const digital = getDigitalAmount(s);
    grandCash += cash;
    grandDigital += digital;
    byDayMap[key].total += total;
    byDayMap[key].cashTotal += cash;
    byDayMap[key].digitalTotal += digital;
  }
  const byDay = Object.values(byDayMap).sort((a, b) => (a.dayKey < b.dayKey ? 1 : -1));
  return { grand, grandCash, grandDigital, perHost, byDay, completedCount, pendingValue };
}

