import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Camera, Sparkles } from 'lucide-react';
import { useEvent } from '../contexts/EventContext.jsx';
import EventHeader from '../components/EventHeader.jsx';
import SuggestPriceCard from '../components/SuggestPriceCard.jsx';
import { suggestPriceFromImage } from '../data/suggestPrice.js';

// Standalone pricing helper. Snap a photo → AI suggests a garage-sale
// price. The host either uses the number on a sticker or doesn't —
// either way the app doesn't track what they did with it, so there's
// no accept/save flow and no per-session counter.
//
// This is intentionally decoupled from SalePage. Pricing happens before
// a sale exists — when items are first put out — not during a
// transaction.
export default function PriceHelperPage() {
  const { eventId } = useParams();
  const { event } = useEvent();

  // null | { kind: 'loading' } | { kind: 'error', message } | { kind: 'result', data }
  const [suggestState, setSuggestState] = useState(null);
  const fileInputRef = useRef(null);

  const eventClosed = event?.status === 'closed';

  const openPicker = () => {
    if (!fileInputRef.current) return;
    fileInputRef.current.value = '';
    fileInputRef.current.click();
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSuggestState({ kind: 'loading' });
    try {
      const data = await suggestPriceFromImage(file);
      setSuggestState({ kind: 'result', data });
    } catch (err) {
      setSuggestState({ kind: 'error', message: err?.message || 'Something went wrong. Try again.' });
    }
  };

  const handleDismiss = () => setSuggestState(null);

  return (
    <div className="min-h-screen flex flex-col bg-canvas pb-10">
      <EventHeader title="Price helper" backTo={`/e/${eventId}`} />

      <main className="flex-1 px-4 py-5 flex flex-col gap-4">
        {eventClosed && (
          <div className="card p-3 bg-slate-100 border border-slate-200 text-[13px] text-slate-700">
            Event is closed. You can still price items, but it won't affect totals.
          </div>
        )}

        {/* Intro card — only when there's no active suggestion */}
        {!suggestState && (
          <section className="card p-6 flex flex-col items-center text-center gap-3">
            <div className="rounded-full bg-accent-soft p-3">
              <Sparkles size={22} className="text-accent-deep" />
            </div>
            <div className="text-[17px] font-semibold text-ink">Snap a photo of an item</div>
            <div className="text-[13px] text-muted max-w-xs">
              I'll identify it, look up comparable listings, and suggest a fair garage-sale price.
            </div>
            <button
              type="button"
              onClick={openPicker}
              className="btn-primary flex items-center justify-center gap-2 mt-2 px-6"
            >
              <Camera size={20} /> Take a photo
            </button>
          </section>
        )}

        {suggestState && (
          <SuggestPriceCard
            state={suggestState}
            onRetake={openPicker}
            onDismiss={handleDismiss}
          />
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFile}
        />
      </main>
    </div>
  );
}
