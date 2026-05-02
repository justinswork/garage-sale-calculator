import { Link } from 'react-router-dom';
import { useEvent } from '../contexts/EventContext.jsx';
import EventHeader from '../components/EventHeader.jsx';
import { formatMoney } from '../utils/money.js';
import { formatTime, localDayKey, formatDayLabel } from '../utils/dates.js';
import { effectiveTotal } from '../utils/sale.js';

export default function AuditPage() {
  const { event, hosts, sales, saleNumberMap } = useEvent();

  const deleted = sales.filter((s) => s.deletedAt);
  const hostName = (id) => hosts.find((h) => h.id === id)?.name || 'Unknown';

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <EventHeader title="Audit log" backTo={`/e/${event.id}`} />
      <main className="flex-1 px-4 py-4 flex flex-col gap-3">
        {deleted.length === 0 ? (
          <div className="card p-6 text-center text-muted text-[14px]">
            No deleted sales.
          </div>
        ) : (
          deleted.map((s) => {
            const created = s.createdAt?.toDate ? s.createdAt.toDate() : new Date();
            const day = formatDayLabel(localDayKey(created));
            const num = saleNumberMap[s.id];
            return (
              <Link
                key={s.id}
                to={`/e/${event.id}/sale/${s.id}`}
                className="card p-4 flex items-center justify-between active:opacity-70"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-[15px]">
                    {num && <span className="text-muted font-medium">#{num} · </span>}
                    {s.items?.length || 0} item{s.items?.length === 1 ? '' : 's'}
                  </div>
                  <div className="text-[12px] text-muted">
                    {day} · {formatTime(created)} · entered by {hostName(s.enteredByHostId)} · deleted by {hostName(s.deletedBy)}
                  </div>
                </div>
                <div className="font-bold tabular-nums text-muted line-through">
                  {formatMoney(effectiveTotal(s))}
                </div>
              </Link>
            );
          })
        )}
      </main>
    </div>
  );
}
