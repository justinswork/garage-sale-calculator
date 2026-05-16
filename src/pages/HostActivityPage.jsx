import { useMemo } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowRight, Banknote, Smartphone, AlertTriangle, Wallet } from 'lucide-react';
import { useEvent } from '../contexts/EventContext.jsx';
import EventHeader from '../components/EventHeader.jsx';
import HostPill, { HostDot } from '../components/HostPill.jsx';
import { paymentColor } from '../utils/colors.js';
import { formatMoney } from '../utils/money.js';
import { formatTime, localDayKey, formatDayLabel } from '../utils/dates.js';
import { computeHostShare, computeReceivedAtSale, isPending, effectiveTotal } from '../utils/sale.js';

export default function HostActivityPage() {
  const { eventId, hostId } = useParams();
  const location = useLocation();
  const { event, hosts, sales, saleNumberMap, settlements, currentHost } = useEvent();

  const host = hosts.find((h) => h.id === hostId);

  const data = useMemo(() => {
    if (!host) return null;
    const saleEntries = [];
    let totalEarned = 0;
    let cashFromSales = 0;
    let digitalFromSales = 0;
    let pendingCount = 0;
    for (const s of sales) {
      if (s.deletedAt) continue;
      if (s.status === 'draft') continue;
      const share = computeHostShare(s, host.id);
      const received = computeReceivedAtSale(s, host.id);
      if (share.total === 0 && received.cash === 0 && received.digital === 0 && !share.pending) continue;
      saleEntries.push({ sale: s, share, received });
      if (share.pending) {
        pendingCount++;
      } else {
        totalEarned += share.total;
        cashFromSales += received.cash;
        digitalFromSales += received.digital;
      }
    }
    saleEntries.sort((a, b) => {
      const aT = a.sale.createdAt?.toMillis ? a.sale.createdAt.toMillis() : 0;
      const bT = b.sale.createdAt?.toMillis ? b.sale.createdAt.toMillis() : 0;
      return bT - aT;
    });

    const settlementEntries = (settlements || [])
      .filter((s) => s.from === host.id || s.to === host.id)
      .slice()
      .sort((a, b) => {
        const aT = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const bT = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return bT - aT;
      });

    let cashSettlementsIn = 0;
    let cashSettlementsOut = 0;
    let digitalSettlementsIn = 0;
    let digitalSettlementsOut = 0;
    for (const st of settlementEntries) {
      const isCash = st.paymentMethod === 'cash';
      if (st.to === host.id) {
        if (isCash) cashSettlementsIn += st.amount;
        else digitalSettlementsIn += st.amount;
      } else if (st.from === host.id) {
        if (isCash) cashSettlementsOut += st.amount;
        else digitalSettlementsOut += st.amount;
      }
    }

    const cashNow = cashFromSales + cashSettlementsIn - cashSettlementsOut;
    const digitalNow = digitalFromSales + digitalSettlementsIn - digitalSettlementsOut;
    // Aggregate items sold by this host across all non-draft/non-deleted sales,
    // combining identical name+price entries (so 5 books @ $1 + 5 books @ $1
    // become "10 × Books").
    const itemMap = {};
    let itemQtyTotal = 0;
    let itemTotalValue = 0;
    for (const s of sales) {
      if (s.deletedAt) continue;
      if (s.status === 'draft') continue;
      for (const it of s.items || []) {
        if (it.hostId !== host.id) continue;
        const trimmedName = it.name?.trim() || '';
        const isUntitled = !trimmedName;
        const key = isUntitled
          ? `__untitled__|${it.unitPrice}`
          : `${trimmedName.toLowerCase()}|${it.unitPrice}`;
        if (!itemMap[key]) {
          itemMap[key] = {
            name: trimmedName,
            isUntitled,
            unitPrice: it.unitPrice,
            qty: 0,
            total: 0
          };
        }
        const q = it.qty || 1;
        itemMap[key].qty += q;
        itemMap[key].total += q * it.unitPrice;
        itemQtyTotal += q;
        itemTotalValue += q * it.unitPrice;
      }
    }
    const itemsSold = Object.values(itemMap).sort((a, b) => b.total - a.total);

    return {
      saleEntries,
      settlementEntries,
      totalEarned,
      cashFromSales,
      digitalFromSales,
      pendingCount,
      cashNow,
      digitalNow,
      hasOpenBalance: cashNow + digitalNow !== totalEarned,
      itemsSold,
      itemQtyTotal,
      itemTotalValue
    };
  }, [host, sales, settlements]);

  if (!host) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <p className="font-semibold mb-2">Host not found</p>
        <Link to={`/e/${eventId}`} className="btn-secondary">Back to event</Link>
      </div>
    );
  }

  const isYou = currentHost.id === host.id;

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <EventHeader title={isYou ? 'Your activity' : `${host.name}'s activity`} backTo={`/e/${event.id}`} />
      <main className="flex-1 px-4 py-4 flex flex-col gap-4">
        <section className="card p-5 flex flex-col gap-2">
          <HostPill host={host} hosts={hosts} you={isYou} />
          <div className="text-[36px] font-bold leading-none tracking-tight tabular-nums">
            {formatMoney(data.totalEarned)}
          </div>
          <div className="text-[13px] text-muted">
            earned across {data.saleEntries.length - data.pendingCount} transaction{data.saleEntries.length - data.pendingCount === 1 ? '' : 's'}
          </div>
          <div className="border-t border-hairline pt-3 flex flex-col gap-1.5 text-[13px]">
            <Row label="Cash now" value={data.cashNow} bold />
            <Row label="Venmo now" value={data.digitalNow} bold />
            {data.cashNow + data.digitalNow !== data.totalEarned && (
              <div className="text-[11px] text-amber-700 pt-1 flex items-center gap-1">
                <AlertTriangle size={12} />
                {formatMoney(data.totalEarned - (data.cashNow + data.digitalNow))} still owed via open settlement
              </div>
            )}
          </div>
        </section>

        {data.itemsSold.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-[12px] uppercase tracking-wide text-muted px-2">Items sold</h3>
            <div className="card divide-y divide-hairline">
              {data.itemsSold.map((it) => (
                <div key={`${it.isUntitled ? '__untitled__' : it.name}|${it.unitPrice}`} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-[14px] truncate">
                      {it.qty > 1 && <span className="text-muted font-medium">{it.qty} × </span>}
                      {it.isUntitled ? (
                        <span className="text-muted italic font-normal">untitled</span>
                      ) : it.name}
                    </div>
                    {it.qty > 1 && (
                      <div className="text-[11px] text-muted tabular-nums">{formatMoney(it.unitPrice)} each</div>
                    )}
                  </div>
                  <div className="font-semibold tabular-nums text-[14px]">{formatMoney(it.total)}</div>
                </div>
              ))}
              <div className="px-4 py-2 flex items-center justify-between text-[12px] text-muted bg-canvas">
                <span>{data.itemQtyTotal} item{data.itemQtyTotal === 1 ? '' : 's'} total</span>
                <span className="tabular-nums font-semibold text-ink">{formatMoney(data.itemTotalValue)}</span>
              </div>
            </div>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h3 className="text-[12px] uppercase tracking-wide text-muted px-2">Transactions</h3>
          {data.saleEntries.length === 0 ? (
            <div className="card p-4 text-center text-[14px] text-muted">
              No transactions include {host.name}'s items yet.
            </div>
          ) : (
            data.saleEntries.map(({ sale, share, received }) => (
              <ShareRow
                key={sale.id}
                sale={sale}
                share={share}
                received={received}
                eventId={event.id}
                saleNumber={saleNumberMap[sale.id]}
                showOwedHints={data.hasOpenBalance}
                hostId={host.id}
                fromPath={location.pathname}
              />
            ))
          )}
        </section>

        {data.settlementEntries.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-[12px] uppercase tracking-wide text-muted px-2">Settlements</h3>
            {data.settlementEntries.map((st) => (
              <SettlementRow
                key={st.id}
                settlement={st}
                hostId={host.id}
                hosts={hosts}
              />
            ))}
          </section>
        )}
      </main>
    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-muted ${bold ? 'text-ink font-semibold' : ''}`}>{label}</span>
      <span className={`tabular-nums ${bold ? 'font-bold' : 'font-semibold'}`}>{formatMoney(value)}</span>
    </div>
  );
}

function ShareRow({ sale, share, received, eventId, saleNumber, showOwedHints, hostId, fromPath }) {
  const time = sale.createdAt?.toDate ? sale.createdAt.toDate() : new Date();
  const day = formatDayLabel(localDayKey(time));
  const method = sale.paymentMethod || 'cash';
  const c = paymentColor(method);
  const Icon = method === 'digital' ? Smartphone : method === 'split' ? Wallet : Banknote;
  const myItems = (sale.items || []).filter((it) => it.hostId === hostId);
  const itemsLabel = myItems
    .map((it) => {
      const name = it.name?.trim() || 'untitled';
      return (it.qty || 1) > 1 ? `${it.qty} × ${name}` : name;
    })
    .join(', ');
  const truncatedLabel = itemsLabel.length > 48
    ? itemsLabel.slice(0, 47) + '…'
    : itemsLabel;
  const receivedTotal = (received?.cash || 0) + (received?.digital || 0);
  const owedToYou = share.total - receivedTotal;
  return (
    <Link
      to={`/e/${eventId}/sale/${sale.id}`}
      state={{ from: fromPath }}
      className="card p-3 flex items-center gap-3 active:opacity-70"
    >
      <div className={`w-10 h-10 rounded-xl ${c.bg} ${c.icon} flex items-center justify-center shrink-0`}>
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[15px] truncate">
          {saleNumber && <span className="text-muted font-medium">#{saleNumber} · </span>}
          {truncatedLabel || 'No items'}
        </div>
        <div className="text-[12px] text-muted truncate">
          {day} · {formatTime(time)}
          {method === 'split' && ' · split'}
          {share.pending && ' · pending'}
        </div>
      </div>
      <div className="text-right shrink-0">
        {share.pending ? (
          <span className="text-amber-600 text-[12px] font-semibold flex items-center gap-1">
            <AlertTriangle size={12} /> pending
          </span>
        ) : (
          <>
            <div className="font-bold tabular-nums text-[15px]">{formatMoney(receivedTotal)}</div>
            {(received.cash > 0 && received.digital > 0) && (
              <div className="text-[10px] text-muted tabular-nums">
                {formatMoney(received.cash)} cash · {formatMoney(received.digital)} Venmo
              </div>
            )}
            {showOwedHints && owedToYou > 0 && (
              <div className="text-[10px] text-amber-700 tabular-nums">
                +{formatMoney(owedToYou)} owed
              </div>
            )}
            {showOwedHints && owedToYou < 0 && (
              <div className="text-[10px] text-amber-700 tabular-nums">
                holding {formatMoney(-owedToYou)} for others
              </div>
            )}
          </>
        )}
      </div>
    </Link>
  );
}

function SettlementRow({ settlement, hostId, hosts }) {
  const isReceiver = settlement.to === hostId;
  const otherId = isReceiver ? settlement.from : settlement.to;
  const otherHost = hosts.find((h) => h.id === otherId);
  if (!otherHost) return null;
  const isCash = settlement.paymentMethod === 'cash';
  const c = paymentColor(isCash ? 'cash' : 'digital');
  const Icon = isCash ? Banknote : Smartphone;
  const time = settlement.createdAt?.toDate ? settlement.createdAt.toDate() : new Date();
  const day = formatDayLabel(localDayKey(time));
  return (
    <div className="card p-3 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl ${c.bg} ${c.icon} flex items-center justify-center shrink-0`}>
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] flex items-center gap-1.5 flex-wrap">
          {isReceiver ? (
            <>
              <HostPill host={otherHost} hosts={hosts} size="sm" />
              <span className="text-muted">paid you</span>
            </>
          ) : (
            <>
              <span className="text-muted">You paid</span>
              <HostPill host={otherHost} hosts={hosts} size="sm" />
            </>
          )}
        </div>
        <div className="text-[12px] text-muted">{day} · {formatTime(time)} · {isCash ? 'cash' : 'Venmo'}</div>
      </div>
      <div className="text-right shrink-0">
        <div className={`font-bold tabular-nums text-[15px] ${isReceiver ? 'text-emerald-700' : 'text-red-600'}`}>
          {isReceiver ? '+' : '−'}{formatMoney(settlement.amount)}
        </div>
      </div>
    </div>
  );
}
