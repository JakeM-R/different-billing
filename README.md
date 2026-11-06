# Billing & collections

**Live:** https://jakem-r.github.io/different-billing/

At month-end, who do we bill and for how much, who owes us money right now, and what goes to the accountants?

Drop in a contracts file (a CRM export or a Sheet) and the page gives you this month's invoices, aging by customer with a drafted email for each one late, a close pack for the external accountants and a three-line summary for the founders. It runs on demo data when it opens. Everything runs in the browser, and nothing is uploaded or stored.

A working prototype by Jake Makking-Robinson for Different's Founder's Office Finance & BizOps role, built against one line of the posting: "Work with external accountants and internal teams to keep billing, payments, reporting…".

## What it does

**01 · Bill (month-end).** Active contracts on their cycle get billed: monthly every month, quarterly every third month from the start month, annual in the start month, and one-off fees (onboarding, setup) once, in the start month. A contract that starts or ends partway through its cycle is prorated by day, and usage units × unit price become their own line. You get one invoice per customer with a line per contract, numbered `INV-YYMM-001` onwards, issued on the last day of the month and due on the customer's terms. Before anything goes out, it checks for: no billing email, a PO required but missing, a monthly bill that moved 25% or more with no contract reason, duplicate contracts and bad rows. A waterfall from last month's total to this one gives a reason for every change and reconciles to the cent. Outputs: a cover email per invoice (edit, copy or open in Gmail), invoice PDFs, a CSV laid out for QuickBooks Online's import, and **Add to aging run**.

**02 · Chase (every two weeks).** Aging by customer (current, 1–30, 31–60, 61–90, 90+ days at the run date) from an invoice export or the billing run's own invoices. Sorts: Needs action, Most overdue, Largest amount. There's one chaser draft per customer covering every open invoice. The tier comes from the oldest overdue invoice, tone moves a step with payment history, Tier 4 goes out from a founder and 90+ days gets a call, not an email. The thresholds are on the page under "How tiers are set".

**03 · Hand off.** The close pack has the invoice register for the month (number, customer, issue and due dates, amount, status), AR aging buckets at the run date, and a reconciliation note listing contracts added, ended or changed against last month. It downloads as one CSV and a one-page PDF. There's no GL coding or revenue recognition: those are the accountants' call. The three-line summary for the founders covers billed against last month, what's overdue, and which drafts need a founder's signature.

**Make it run itself.** A Google Apps Script with the same aging core runs every other Monday on a Sheet, saves Gmail drafts (replacing last run's unsent ones) and can post a summary to Slack.

**Demo data is fictional:** a seed-stage B2B SaaS book with Customers A to L, made up of monthly and annual platform subscriptions, a seat add-on, usage-billed credits and two onboarding fees. Most are Net 30, with two customers on Net 45. In demo mode every dollar figure shows as `$xx` and demo downloads are labelled. Dates are generated relative to today, so the demo reads the same whenever it's opened.

## Layout

| Path | What |
|---|---|
| `site/ar.js` | Aging core: CSV parser, column mapper, aging, tiers, templates, validator. No DOM or network code, so the same file runs in the browser, in Node tests and in Apps Script. |
| `site/billing.js` | Billing core: contract mapper, cycles (including one-off), proration, usage, flags, the bridge, QuickBooks CSV, cover emails and the hand-off to aging. |
| `site/close-pack.js` | Close pack (register, aging buckets, reconciliation note) as CSV and a one-page PDF, plus the founder summary. Pure. |
| `site/invoice-pdf.js`, `site/vendor/` | Invoice PDFs drawn with jsPDF 2.5.1 (MIT, vendored; loaded only on download). |
| `site/demo.js` | Demo invoices and contracts, with edge cases seeded. |
| `site/app.js`, `site/index.html` | The page. |
| `site/sheet-runner.js` | Apps Script glue. The page builds `Code.gs` by joining `ar.js` and this file. |
| `worker/` | Optional Cloudflare Worker that drafts with Claude. Rate-capped, and it builds the prompt itself, so it can't be used as an open proxy. Every model draft is checked in the browser against the hard rules (figures from the input only, no legal language, no fees unless the terms state one, under 120 words, sign-off present) and replaced by the template if it fails. |
| `tests/` | Node tests for aging, billing, the close pack and the Apps Script (with mocked Sheets, Gmail and Slack). |

## Run locally

```bash
node --test tests/*.test.js
python3 -m http.server -d site
```

GitHub Pages deploys `site/` on every push to `main`, after the tests pass.

## Notes

- **Visual language:** colours and type are by-eye stand-ins (Instrument Serif, Inter, JetBrains Mono). No marks or illustrations are used.
- **Dates:** slash dates are read as US (MM/DD/YYYY) unless the file shows they're day first; the column matcher lets you override it.
- **Late history:** the tone modifiers need a paid-date column. Without one, tone follows tier.
- **Out of scope:** payment matching, GL coding, revenue recognition, taxes, credit notes, multi-currency, live Stripe or QuickBooks auth, and sending email.
- **Next:** payments. Drop in a bank or Stripe payout CSV, match receipts to open invoices, mark them paid, and update the aging and the close pack.
