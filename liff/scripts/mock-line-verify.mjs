// A local stand-in for LINE's ID token verify endpoint (POST /verify), used on stage and in development.
// It accepts "valid.<LINE user ID>" for the configured channel, which is what the app's LIFF mock returns.
// Never point production at it. Env: MOCK_LINE_VERIFY_PORT (4545), LINE_LOGIN_CHANNEL_ID (1234567890).
import { createServer } from 'node:http';

// `||`, not `??`: a key left empty in .env counts as unset.
const port = Number(process.env.MOCK_LINE_VERIFY_PORT || 4545);
const channelId = process.env.LINE_LOGIN_CHANNEL_ID || '1234567890';
const LINE_USER_ID = /^U[0-9a-f]{32}$/;

const server = createServer((req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (req.method !== 'POST' || req.url !== '/verify') return send(404, { error: 'not_found' });
  let raw = '';
  req.on('data', (chunk) => (raw += chunk));
  req.on('end', () => {
    const form = new URLSearchParams(raw);
    if (form.get('client_id') !== channelId) {
      return send(400, { error: 'invalid_request', error_description: 'Invalid IdToken Audience.' });
    }
    // Exactly two parts: "valid.U…" passes, "valid.U….extra" doesn't.
    const parts = (form.get('id_token') ?? '').split('.');
    const [kind, sub] = parts;
    if (parts.length !== 2 || kind !== 'valid' || !LINE_USER_ID.test(sub)) {
      return send(400, { error: 'invalid_request', error_description: 'Invalid IdToken.' });
    }
    const now = Math.floor(Date.now() / 1000);
    return send(200, { iss: 'https://access.line.me', sub, aud: channelId, exp: now + 3600, iat: now, amr: ['linesso'], name: 'Demo customer' });
  });
});

server.listen(port, '127.0.0.1', () =>
  console.log(`Mock LINE verify endpoint on http://127.0.0.1:${port}/verify: accepts valid.<LINE user ID> for channel ${channelId}`)
);
