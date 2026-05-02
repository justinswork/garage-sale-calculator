import { useState } from 'react';
import { Users, Plus } from 'lucide-react';
import { addHost } from '../data/hosts.js';

export default function JoinEventScreen({ event, hosts, uid, onPicked }) {
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

  const pickExisting = async (id) => {
    setBusy(true);
    setError('');
    try {
      await onPicked(id);
    } finally {
      setBusy(false);
    }
  };

  const addNew = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    if (hosts.length >= 99) {
      setError('This event already has the maximum of 99 hosts.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const id = await addHost(event.id, { name, uid });
      await onPicked(id);
    } catch (err) {
      setError(err.message || 'Could not add host');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <header className="px-4 pt-6 pb-2 flex flex-col items-center gap-2 text-center">
        <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center text-white shadow-card">
          <Users size={26} strokeWidth={1.6} />
        </div>
        <h1 className="text-[22px] font-bold tracking-tight">{event.name}</h1>
        <p className="text-[13px] text-muted">Who are you?</p>
      </header>

      <main className="flex-1 px-4 py-6 flex flex-col items-center gap-5">
        {hosts.length > 0 && (
          <div className="w-full max-w-md flex flex-col gap-2">
            <div className="text-[12px] uppercase tracking-wide text-muted px-2">I'm one of these hosts</div>
            {hosts.map((h) => (
              <button
                key={h.id}
                onClick={() => pickExisting(h.id)}
                disabled={busy}
                className="card p-4 text-left active:opacity-70 disabled:opacity-50 font-semibold"
              >
                {h.name}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={addNew} className="card p-5 w-full max-w-md flex flex-col gap-3">
          <h2 className="text-[16px] font-semibold flex items-center gap-2">
            <Plus size={18} /> Add me as a new host
          </h2>
          <input
            className="input"
            placeholder="Your name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={busy}
            autoCapitalize="words"
          />
          <button type="submit" className="btn-primary" disabled={busy || !newName.trim()}>
            {busy ? 'Joining…' : 'Join event'}
          </button>
        </form>

        {error && <div className="text-red-600 text-[13px] text-center">{error}</div>}
      </main>
    </div>
  );
}
