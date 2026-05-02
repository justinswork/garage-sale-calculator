const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function shortId(len = 12) {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[buf[i] % ALPHABET.length];
  return out;
}
