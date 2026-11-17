# Ads Studio — AI-Assisted Advertising Module

> Owner note (Grant, 17 Nov): businesses must be able to completely run AI-assisted ads
> for Meta Ads and Google Ads — "Ads made simple and easy". We charge a percentage of
> ad spend as our fee, and every advertiser gets AI recommendations that guide them.
> Analytics must show how the money is spent and the ROI from the ads.

## 1. Vision

Give every OmniCRM business the advertising power of a ₦500k/month agency — at the cost
of a small percentage of what they spend. No marketing degree, no agency calls, no
guesswork: the AI plans, builds, launches, optimises and reports.

**One-liner:** "Tell the AI what you sell and how much you have — it runs the ads and
shows you every naira back."

## 2. The Flow (from a business owner's eyes)

1. **Connect** — one-tap OAuth to Meta (Facebook/Instagram) and Google (Search/YouTube).
2. **Goal** — pick one: more sales, more calls/WhatsApp chats, more shop visits, or brand reach.
3. **Budget** — enter daily/weekly budget in naira. The platform shows the fee up front
   (e.g. 10% of spend), so the owner knows the real total.
4. **AI builds** — headline options, ad copy (in English, Pidgin or Yoruba), image/video
   suggestions from their product photos, and the audience (location, interests, lookalikes).
5. **Approve** — the owner swipes through 2–3 creative variants and hits Launch.
6. **Live analytics** — spend, impressions, clicks, calls/WhatsApp chats, sales (tracked
   back into the CRM), and ROI/ROAS, updated in real time.
7. **AI optimisation** — weekly recommendations: "Shift ₦5k from audience B to audience A —
   it converts 3x better", "This creative is fatigued — refresh it?", auto-pause rules.

## 3. Fee Model

- **Management fee: a percentage of ad spend** (default 10%, tier-configurable).
- Billing: ad spend + fee collected together via Paystack (card, bank transfer, USSD) —
  the owner never touches Meta/Google billing directly. We pay the platforms from the
  pooled balance.
- Optional add-ons: premium creative (₦/month), dedicated analyst (Pro tier+).
- Volume discounts on fee % for Enterprise accounts.

## 4. Analytics & ROI Reporting

- **Spend dashboard:** by channel, campaign, day; budget burn-rate alerts.
- **Performance:** impressions, clicks, CTR, cost-per-click, conversions.
- **ROI view:** ad-attributed sales matched to CRM invoices (pixel + UTM + WhatsApp link
  tracking), ROAS per campaign and per naira spent.
- **The Monday Report:** one WhatsApp message — "Ads spent ₦45k, brought ₦210k in tracked
  sales (4.7x ROI). Best ad: 'Free delivery in Lekki'. Recommendation: raise budget 20%."
- Honest metrics: we show wasted spend too, and what the AI is doing about it.

## 5. The AI Recommendation Engine

- Budget allocation: shifts money to winning audiences/placements automatically (with
  owner approval).
- Creative: A/B tests headlines/visuals, flags fatigue, suggests refreshes from the
  business's own photos.
- Timing: best days/hours from conversion data.
- Guardrails: spend caps, stop-loss rules, and full pause at owner's word. AI never
  increases budget without approval.

## 6. Integrations

- Meta Marketing API (campaigns, adsets, creative, insights) + Conversions API.
- Google Ads API (Search, Performance Max) + remarketing.
- Lead capture: click-to-WhatsApp, click-to-call, and in-app forms feed straight into
  OmniCRM contacts — every ad lead becomes a CRM lead with the campaign tagged.
- Payments: Paystack for naira collection.

## 7. Platform Requirements (Responsiveness)

- The entire CRM, including Ads Studio, must be responsive: fluid web layout, full
  mobile experience.
- Delivery: PWA (installable on iOS and Android from the browser) + native wrappers via
  Capacitor for app-store distribution (Android Play + iOS App Store).
- Ads Studio mobile UX: approve creative, check ROI and adjust budget from a phone in
  under 30 seconds.

## 8. Build Phasing

- Phase A (MVP+1): campaign creation wizard, budget + fee engine, Meta Ads connect, basic
  analytics, Paystack billing.
- Phase B: Google Ads connect, ROI matching with CRM sales, WhatsApp weekly report.
- Phase C: AI optimisation (budget shifting, creative fatigue), A/B automation, iOS/Android wrappers.

## 9. Risks

- Meta/Google API approvals and business verification (start process early — weeks).
- Ad-account bans for new advertisers: pre-check ad policies, sandbox first.
- Spend float risk: hold collected funds in a segregated wallet; cap per-account spend.
- Fee transparency: show fee at every step so trust is never broken.
