import { useMemo } from 'react';
import { Download, Smartphone, ArrowRight } from 'lucide-react';
import { useEvent } from '../contexts/EventContext.jsx';
import EventHeader from '../components/EventHeader.jsx';
import { formatMoney } from '../utils/money.js';
import { localDayKey, formatDayLabel, formatTime } from '../utils/dates.js';
import { resolvePerHost, isPending, effectiveTotal, computeSettleUp, applySettlements, getCashAmount, getDigitalAmount, applyDailyCashCarryover } from '../utils/sale.js';

export default function ReportPage() {
  const { event, hosts, sales, settlements } = useEvent();

  const data = useMemo(() => buildReport(sales, hosts), [sales, hosts]);
  const settle = useMemo(() => computeSettleUp(sales, hosts), [sales, hosts]);
  const remainingDebts = useMemo(() => applySettlements(settle.pairwiseDebts, settlements), [settle.pairwiseDebts, settlements]);
  const hostName = (id) => hosts.find((h) => h.id === id)?.name || 'Unknown';
  // data.byDay is already sorted ascending — apply carryover so missing
  // starting-cash days show the previous day's ending cash instead of $0.
  const daysWithCarryover = useMemo(
    () => applyDailyCashCarryover(event, data.byDay),
    [event, data.byDay]
  );

  const exportCsv = () => {
    const rows = [
      ['Sale ID', 'Date', 'Time', 'Entered by', 'Items', 'Subtotal', 'Override', 'Final total',
        'Payment', 'Cash received', 'Change given', 'Venmo recipient', 'Status', 'Notes',
        ...hosts.map((h) => `${h.name} share`)
      ]
    ];
    for (const s of data.includedSales) {
      const created = s.createdAt?.toDate ? s.createdAt.toDate() : new Date();
      const final = effectiveTotal(s);
      const perHost = resolvePerHost(s.items, s.overrideTotal, s.discountAllocation) || {};
      rows.push([
        s.id,
        localDayKey(created),
        formatTime(created),
        hostName(s.enteredByHostId),
        (s.items || []).map((it) => `${it.qty}× ${it.name} @ ${formatMoney(it.unitPrice)} (${hostName(it.hostId)})`).join('; '),
        formatMoney(s.itemsSubtotal),
        s.overrideTotal != null ? formatMoney(s.overrideTotal) : '',
        formatMoney(final),
        s.paymentMethod === 'digital' ? 'Venmo' : 'Cash',
        s.cashReceived != null ? formatMoney(s.cashReceived) : '',
        s.changeGiven != null ? formatMoney(s.changeGiven) : '',
        s.digitalRecipientHostId ? hostName(s.digitalRecipientHostId) : '',
        s.status,
        (s.notes || '').replace(/\n/g, ' '),
        ...hosts.map((h) => formatMoney(perHost[h.id] || 0))
      ]);
    }
    rows.push([]);
    rows.push(['Day', 'Starting cash', 'Cash sales', 'Venmo sales', 'Cash on hand', 'Total sales']);
    for (const day of daysWithCarryover) {
      // Starting cash column reflects the effective value (explicit OR
      // carried over from the prior day) so the spreadsheet matches what
      // the operator sees in the app.
      const startCash = day.effectiveStartingCash;
      rows.push([
        formatDayLabel(day.dayKey),
        formatMoney(startCash),
        formatMoney(day.cashTotal),
        formatMoney(day.digitalTotal),
        formatMoney(startCash + day.cashTotal),
        formatMoney(day.total)
      ]);
    }
    if (settle.totalDigital > 0 && remainingDebts.length > 0) {
      rows.push([]);
      rows.push(['Venmo settle-up (open)']);
      rows.push(['From', 'To', 'Amount']);
      for (const d of remainingDebts) {
        rows.push([hostName(d.from), hostName(d.to), formatMoney(d.amount)]);
      }
    }
    const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event.name.replace(/[^a-z0-9]+/gi, '-')}-${localDayKey(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <EventHeader title="Report" backTo={`/e/${event.id}`} rightSlot={
        <button onClick={exportCsv} className="p-2 -mr-1 text-muted active:opacity-60" aria-label="Export CSV">
          <Download size={20} />
        </button>
      } />
      <main className="flex-1 px-4 py-4 flex flex-col gap-4">
        <section className="card p-5">
          <div className="text-[12px] uppercase tracking-wide text-muted">Grand total</div>
          <div className="text-[40px] font-bold leading-none tracking-tight">{formatMoney(data.grand)}</div>
          <div className="text-[12px] text-muted mt-1">
            {data.includedSales.length} transaction{data.includedSales.length === 1 ? '' : 's'}
            {data.pendingCount > 0 && ` · ${data.pendingCount} pending excluded`}
            {data.deletedCount > 0 && ` · ${data.deletedCount} deleted excluded`}
          </div>
          {(data.grandCash > 0 || data.grandDigital > 0) && (
            <div className="flex items-center gap-3 text-[12px] mt-2 flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-200" />
                <span className="text-muted">Cash</span>
                <span className="font-semibold tabular-nums">{formatMoney(data.grandCash)}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-200" />
                <span className="text-muted">Venmo</span>
                <span className="font-semibold tabular-nums">{formatMoney(data.grandDigital)}</span>
              </span>
            </div>
          )}
        </section>

        <section className="card p-4">
          <h3 className="text-[12px] uppercase tracking-wide text-muted mb-2">Per host</h3>
          {hosts.map((h) => (
            <div key={h.id} className="flex items-center justify-between py-1 border-b border-hairline last:border-b-0">
              <span>{h.name}</span>
              <span className="font-semibold tabular-nums">{formatMoney(data.perHost[h.id] || 0)}</span>
            </div>
          ))}
        </section>

        <section className="card p-4">
          <h3 className="text-[12px] uppercase tracking-wide text-muted mb-2">Per day</h3>
          {daysWithCarryover.length === 0 ? (
            <div className="text-muted text-[14px]">No completed transactions yet.</div>
          ) : daysWithCarryover.map((day) => {
            const startCash = day.effectiveStartingCash;
            const startCashIsSet = event.dailyStartingCash?.[day.dayKey] != null || day.isCarryover;
            return (
              <div key={day.dayKey} className="py-2 border-b border-hairline last:border-b-0">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{formatDayLabel(day.dayKey)}</span>
                  <span className="font-semibold tabular-nums">{formatMoney(day.total)}</span>
                </div>
                <div className="text-[12px] text-muted">
                  {day.sales.length} transaction{day.sales.length === 1 ? '' : 's'}
                </div>
                {(day.cashTotal > 0 || day.digitalTotal > 0) && (
                  <div className="flex items-center gap-3 text-[12px] mt-1 flex-wrap">
                    {day.cashTotal > 0 && (
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-200" />
                        <span className="text-muted">Cash</span>
                        <span className="font-semibold tabular-nums">{formatMoney(day.cashTotal)}</span>
                      </span>
                    )}
                    {day.digitalTotal > 0 && (
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-sky-200" />
                        <span className="text-muted">Venmo</span>
                        <span className="font-semibold tabular-nums">{formatMoney(day.digitalTotal)}</span>
                      </span>
                    )}
                  </div>
                )}
                {startCashIsSet && (
                  <div className="flex items-center justify-between text-[12px] text-muted pt-1">
                    <span>
                      Started with {formatMoney(startCash)}
                      {day.isCarryover && <span className="italic"> (carried over)</span>}
                      {' → cash on hand'}
                    </span>
                    <span className="tabular-nums font-semibold text-ink">{formatMoney(startCash + day.cashTotal)}</span>
                  </div>
                )}
                <div className="pl-2 pt-1">
                  {hosts.map((h) => {
                    const amt = day.perHost[h.id] || 0;
                    if (amt === 0) return null;
                    return (
                      <div key={h.id} className="flex items-center justify-between text-[13px] text-muted">
                        <span>{h.name}</span>
                        <span className="tabular-nums">{formatMoney(amt)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>

        {settle.totalDigital > 0 && (
          <section className="card p-4 flex flex-col gap-3">
            <h3 className="text-[12px] uppercase tracking-wide text-muted flex items-center gap-1.5">
              <Smartphone size={14} /> Venmo settle-up
            </h3>
            {remainingDebts.length === 0 ? (
              <div className="text-[13px] text-muted">All settled.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {remainingDebts.map((d) => (
                  <div key={`${d.from}|${d.to}`} className="flex items-center gap-2 text-[14px]">
                    <span className="font-semibold">{hostName(d.from)}</span>
                    <span className="text-muted">owes</span>
                    <span className="font-semibold">{hostName(d.to)}</span>
                    <span className="ml-auto font-bold tabular-nums">{formatMoney(d.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-hairline pt-3 flex flex-col gap-1.5 text-[12px]">
              {hosts.map((h) => {
                const p = settle.perHost[h.id];
                if (!p || (p.earned === 0 && p.digitalReceived === 0)) return null;
                return (
                  <div key={h.id} className="flex items-center justify-between text-muted">
                    <span className="text-ink">{h.name}</span>
                    <span className="tabular-nums">
                      earned {formatMoney(p.earned)} · cash {formatMoney(p.cashEarned)} · Venmo {formatMoney(p.digitalReceived)}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {data.pendingCount > 0 && (
          <div className="card p-4 bg-amber-50 border border-amber-200 text-amber-800 text-[13px]">
            {data.pendingCount} transaction{data.pendingCount === 1 ? ' has' : 's have'} a pending discount allocation
            and {data.pendingCount === 1 ? 'is' : 'are'} excluded from totals. Tap the warning on the home screen to resolve.
          </div>
        )}
      </main>
    </div>
  );
}

function buildReport(sales, hosts) {
  const perHost = Object.fromEntries(hosts.map((h) => [h.id, 0]));
  const byDayMap = {};
  let grand = 0;
  let grandCash = 0;
  let grandDigital = 0;
  let pendingCount = 0;
  let deletedCount = 0;
  const includedSales = [];
  for (const s of sales) {
    if (s.deletedAt) {
      deletedCount++;
      continue;
    }
    if (s.status === 'draft') continue;
    if (isPending(s)) {
      pendingCount++;
      continue;
    }
    const finalPerHost = resolvePerHost(s.items, s.overrideTotal, s.discountAllocation);
    if (!finalPerHost) continue;
    const total = effectiveTotal(s);
    grand += total;
    for (const [hid, amt] of Object.entries(finalPerHost)) {
      perHost[hid] = (perHost[hid] || 0) + amt;
    }
    const ts = s.createdAt?.toDate ? s.createdAt.toDate() : new Date();
    const key = localDayKey(ts);
    if (!byDayMap[key]) byDayMap[key] = { dayKey: key, total: 0, cashTotal: 0, digitalTotal: 0, sales: [], perHost: {} };
    const cash = getCashAmount(s);
    const digital = getDigitalAmount(s);
    grandCash += cash;
    grandDigital += digital;
    byDayMap[key].total += total;
    byDayMap[key].cashTotal += cash;
    byDayMap[key].digitalTotal += digital;
    byDayMap[key].sales.push(s);
    for (const [hid, amt] of Object.entries(finalPerHost)) {
      byDayMap[key].perHost[hid] = (byDayMap[key].perHost[hid] || 0) + amt;
    }
    includedSales.push(s);
  }
  const byDay = Object.values(byDayMap).sort((a, b) => (a.dayKey < b.dayKey ? -1 : 1));
  return { grand, grandCash, grandDigital, perHost, byDay, pendingCount, deletedCount, includedSales };
}

function csvEscape(val) {
  const s = String(val ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
