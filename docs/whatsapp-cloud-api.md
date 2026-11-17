# WhatsApp Cloud API — setup & behaviour

## What exists now

- `GET /webhooks/whatsapp` — Meta verification handshake
  (`hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=<challenge>` → echoes challenge).
- `POST /webhooks/whatsapp` — inbound `messages` webhook; text messages from numbers
  matching a contact's phone land in the WhatsApp inbox as incoming messages
  (mapped to the owner user for now; multi-user routing needs a per-user
  phone-number registry — Phase C).
- Outbound: `POST /messages` sends via the Cloud API when configured; otherwise the
  message is stored with status `sent` (simulation, clearly noted to the demo user).

## To go live

1. Meta Business account → WhatsApp > API setup (business verification required).
2. Set env vars on the API process:
   - `WHATSAPP_TOKEN` — system user token
   - `WHATSAPP_PHONE_NUMBER_ID` — the WABA phone number id
   - `WHATSAPP_VERIFY_TOKEN` — any random string you choose
3. In the Meta dashboard, set the webhook URL to
   `https://<your-domain>/api/webhooks/whatsapp` and the verify token.
4. Subscribe to the `messages` field. Done — inbound chats appear in the inbox and
   outbound messages deliver for real.

## WhatsApp policy notes

- Free-form text replies are allowed within 24h of the customer's last message
  (customer-service window). Outside that window, template messages are required —
  the AI-draft gate stays: never send without owner tap.
