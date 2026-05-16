import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';

// 60s timeout — the function does two Claude calls and one Voyage call,
// which can run 8-15s on a cold start. Keep the client a bit slack of the
// 60s server timeout so the user gets a friendlier error on actual hang.
const callSuggestPrice = httpsCallable(functions, 'suggestPrice', {
  timeout: 60_000
});

// Client side of the photo-to-price flow.
// - Resizes the input image to a sane long-edge before upload (mobile
//   cameras shoot 4-8MB; we don't need full res for identification and
//   smaller payloads = faster identification + cheaper image tokens).
// - JPEG-encodes at quality 0.85.
// - Invokes the Firebase callable and unwraps `data`.
//
// Returns the function's full response shape:
//   { identified, comps, priceSuggestion }
// See functions/src/types.ts → SuggestPriceResponse.

export async function suggestPriceFromImage(file) {
  if (!file) throw new Error('No image selected.');
  const { base64, mediaType } = await resizeToBase64Jpeg(file, {
    maxLongEdge: 2048,
    quality: 0.85
  });
  const res = await callSuggestPrice({ image: { base64, mediaType } });
  return res.data;
}

// Load a File/Blob into an HTMLImageElement, then redraw onto a canvas at
// the target size. Returns base64 (no data-URL prefix) + media type ready
// for the Anthropic vision API.
async function resizeToBase64Jpeg(file, { maxLongEdge, quality }) {
  const img = await loadImage(file);
  const scale = Math.min(1, maxLongEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D canvas context.');
  ctx.drawImage(img, 0, 0, w, h);

  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('Failed to encode JPEG.');
  return { base64: dataUrl.slice(comma + 1), mediaType: 'image/jpeg' };
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That photo didn't open. Try a different one."));
    };
    img.src = url;
  });
}

// Map raw errors from the suggestPrice flow to short, user-readable copy.
// Falls back to the original message if no friendly mapping applies.
export function friendlyError(err) {
  if (!err) return 'Something went wrong. Try again.';
  // FirebaseError uses `code` like 'functions/deadline-exceeded'.
  const code = err.code || '';
  if (typeof code === 'string') {
    if (code === 'functions/unauthenticated') {
      return 'You need to be signed in. Reload the page and try again.';
    }
    if (code === 'functions/deadline-exceeded') {
      return 'The suggestion took too long. The server may be warming up — try once more.';
    }
    if (code === 'functions/resource-exhausted' || code === 'functions/unavailable') {
      return "The pricing service is busy right now. Wait a moment and try again.";
    }
    if (code === 'functions/invalid-argument') {
      // Server validation failures carry a usable message we wrote ourselves.
      return err.message || 'That photo could not be used. Try a different one.';
    }
    if (code === 'functions/internal') {
      return 'The pricing service hit an error. Try again, or try a clearer photo.';
    }
  }
  // Browser/network failures from before the call even reaches the server.
  if (err.message?.includes('NetworkError') || err.name === 'TypeError') {
    return 'Network error. Check your connection and try again.';
  }
  return err.message || 'Something went wrong. Try again.';
}
