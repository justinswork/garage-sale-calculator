import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tag, Plus, ArrowRight, Calendar, MapPin } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { createEvent, getEvent } from '../data/events.js';
import { getRecentEvents } from '../utils/storage.js';
import { formatDayLabel } from '../utils/dates.js';

export default function LandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [joinId, setJoinId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recents, setRecents] = useState([]);

  useEffect(() => {
    setRecents(getRecentEvents());
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const id = await createEvent({ name: name || 'Garage Sale', uid: user.uid });
      navigate(`/e/${id}`);
    } catch (err) {
      setError(err.message || 'Could not create event');
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    const id = parseEventInput(joinId);
    if (!id) return;
    setBusy(true);
    setError('');
    try {
      const ev = await getEvent(id);
      if (!ev) {
        setError("That event doesn't exist. Check the link or ID.");
      } else {
        navigate(`/e/${id}`);
      }
    } catch (err) {
      setError(err.message || 'Could not open event');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <header className="px-4 pt-6 pb-2 flex flex-col items-center gap-2">
        <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center text-white shadow-card">
          <Tag size={26} strokeWidth={1.6} />
        </div>
        <h1 className="text-[24px] font-bold tracking-tight">Garage Sale Calculator</h1>
        <p className="text-[13px] text-muted">Track sales, split totals, settle up.</p>
      </header>

      <main className="flex-1 px-4 py-6 flex flex-col items-center gap-6">
        <form onSubmit={handleCreate} className="card p-5 w-full max-w-md flex flex-col gap-3">
          <h2 className="text-[16px] font-semibold flex items-center gap-2">
            <Plus size={18} /> New event
          </h2>
          <input
            className="input"
            placeholder="Event name (e.g. Saturday Yard Sale)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create event'}
          </button>
        </form>

        <form onSubmit={handleJoin} className="card p-5 w-full max-w-md flex flex-col gap-3">
          <h2 className="text-[16px] font-semibold flex items-center gap-2">
            <ArrowRight size={18} /> Open existing event
          </h2>
          <input
            className="input"
            placeholder="Event ID or paste link"
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
            disabled={busy}
            autoCapitalize="none"
            autoCorrect="off"
          />
          <button type="submit" className="btn-secondary" disabled={busy || !parseEventInput(joinId)}>
            {busy ? 'Opening…' : 'Open'}
          </button>
        </form>

        {error && <div className="text-red-600 text-[13px] text-center">{error}</div>}

        {recents.length > 0 && (
          <div className="w-full max-w-md flex flex-col gap-2">
            <div className="text-[12px] uppercase tracking-wide text-muted px-2">Recent</div>
            {recents.map((r) => (
              <RecentEventRow key={r.id} entry={r} onOpen={() => navigate(`/e/${r.id}`)} />
            ))}
          </div>
        )}
      </main>

      <footer className="text-center text-[11px] text-muted py-3">v{__APP_VERSION__}</footer>
    </div>
  );
}

function parseEventInput(input) {
  if (!input) return '';
  const s = input.trim();
  const match = s.match(/\/e\/([a-z0-9]+)/i);
  if (match) return match[1].toLowerCase();
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function RecentEventRow({ entry, onOpen }) {
  const dateLabel = (() => {
    const { startDate, endDate } = entry;
    if (!startDate && !endDate) return null;
    if (startDate && endDate && startDate !== endDate) {
      return `${formatDayLabel(startDate)} – ${formatDayLabel(endDate)}`;
    }
    return formatDayLabel(startDate || endDate);
  })();

  const createdLabel = entry.createdAt
    ? new Date(entry.createdAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: new Date(entry.createdAt).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
      })
    : null;

  return (
    <button
      onClick={onOpen}
      className="card p-4 text-left active:opacity-70 flex items-center gap-3"
    >
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="font-semibold truncate">{entry.name}</div>
        {(entry.creatorName || createdLabel) && (
          <div className="text-[12px] text-muted">
            {entry.creatorName && <>by <span className="text-ink">{entry.creatorName}</span></>}
            {entry.creatorName && createdLabel && ' · '}
            {createdLabel && <>created {createdLabel}</>}
          </div>
        )}
        {(dateLabel || entry.location) && (
          <div className="text-[12px] text-muted flex items-center gap-3 flex-wrap">
            {dateLabel && (
              <span className="flex items-center gap-1">
                <Calendar size={12} />
                {dateLabel}
              </span>
            )}
            {entry.location && (
              <span className="flex items-center gap-1 min-w-0">
                <MapPin size={12} className="shrink-0" />
                <span className="truncate">{entry.location}</span>
              </span>
            )}
          </div>
        )}
      </div>
      <ArrowRight size={18} className="text-muted shrink-0" />
    </button>
  );
}
