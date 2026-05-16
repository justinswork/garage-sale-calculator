import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Camera, Sparkles } from 'lucide-react';
import { useEvent } from '../contexts/EventContext.jsx';
import EventHeader from '../components/EventHeader.jsx';
import SuggestPriceCard from '../components/SuggestPriceCard.jsx';
import { suggestPriceFromImage, friendlyError } from '../data/suggestPrice.js';

// Standalone pricing helper. Snap a photo → AI suggests a garage-sale
// price. The host either uses the number on a sticker or doesn't —
// either way the app doesn't track what they did with it, so there's
// no accept/save flow and no per-session counter.
//
// This is intentionally decoupled from SalePage. Pricing happens before
// a sale exists — when items are first put out — not during a
// transaction.
// sessionStorage key for the last successful suggestion on this event.
// Survives nav-away-and-back within the same tab so the host doesn't
// lose work by tapping the wrong button; clears on tab close.
const lastResultKey = (eventId) => `priceHelper:lastResult:${eventId}`;

function readLastResult(eventId) {
  try {
    const raw = sessionStorage.getItem(lastResultKey(eventId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeLastResult(eventId, data) {
  try { sessionStorage.setItem(lastResultKey(eventId), JSON.stringify(data)); } catch {}
}

function clearLastResult(eventId) {
  try { sessionStorage.removeItem(lastResultKey(eventId)); } catch {}
}

export default function PriceHelperPage() {
  const { eventId } = useParams();
  const { event } = useEvent();

  // null | { kind: 'loading' } | { kind: 'error', message } | { kind: 'result', data }
  // Hydrate from sessionStorage so the result survives navigation.
  const [suggestState, setSuggestState] = useState(() => {
    const data = readLastResult(eventId);
    return data ? { kind: 'result', data } : null;
  });
  const fileInputRef = useRef(null);

  const eventClosed = event?.status === 'closed';
  const aiDisabled = event?.aiFeaturesEnabled === false;

  const openPicker = () => {
    if (!fileInputRef.current) return;
    clearLastResult(eventId);
    fileInputRef.current.value = '';
    fileInputRef.current.click();
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSuggestState({ kind: 'loading' });
    try {
      const data = await suggestPriceFromImage(file);
      writeLastResult(eventId, data);
      setSuggestState({ kind: 'result', data });
    } catch (err) {
      setSuggestState({ kind: 'error', message: friendlyError(err) });
    }
  };

  const handleDismiss = () => {
    clearLastResult(eventId);
    setSuggestState(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-canvas pb-10">
      <EventHeader title="Price helper" backTo={`/e/${eventId}`} />

      <main className="flex-1 px-4 py-5 flex flex-col gap-4">
        {aiDisabled && (
          <div className="card p-4 flex flex-col gap-2">
            <div className="text-[14px] font-semibold text-ink">AI features are off for this event.</div>
            <div className="text-[13px] text-muted">
              Turn them on in event settings to use the price helper.
            </div>
          </div>
        )}

        {!aiDisabled && eventClosed && (
          <div className="card p-3 bg-slate-100 border border-slate-200 text-[13px] text-slate-700">
            Event is closed. You can still price items, but it won't affect totals.
          </div>
        )}

        {/* Intro card — only when there's no active suggestion */}
        {!aiDisabled && !suggestState && (
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

        {!aiDisabled && suggestState && (
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
