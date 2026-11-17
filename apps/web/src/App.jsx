import React, { useEffect, useState } from 'react';

const API = '/api';
const tokenKey = 'omnicrm_token';

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers['Content-Type'] = 'application/json';
  const token = localStorage.getItem(tokenKey);
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(tokenKey));
  const [authMode, setAuthMode] = useState('landing'); // landing | login | register
  const [view, setView] = useState('dashboard');
  const [dept, setDept] = useState('sales');
  const [dash, setDash] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [threads, setThreads] = useState([]);
  const [activeContact, setActiveContact] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [draft, setDraft] = useState('');
  const [composer, setComposer] = useState('');
  const [products, setProducts] = useState([]);
  const [stockValue, setStockValue] = useState(0);
  const [lowCount, setLowCount] = useState(0);
  const [tickets, setTickets] = useState([]);
  const [ticketCounts, setTicketCounts] = useState({ open: 0, pending: 0, closed: 0 });
  const [invoices, setInvoices] = useState([]);
  const [invCounts, setInvCounts] = useState({});
  const [receivables, setReceivables] = useState(0);
  const [invView, setInvView] = useState('list'); // list | new | detail
  const [activeInv, setActiveInv] = useState(null);
  const [invItems, setInvItems] = useState([]);
  const [newInv, setNewInv] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    (async () => {
      try {
        const [d, c, f, t, p, tk, iv] = await Promise.all([
          api('/dashboard'), api('/contacts'), api('/ai/followups'), api('/inbox'),
          api('/products'), api('/tickets'), api('/invoices'),
        ]);
        setDash(d.kpis); setContacts(c.contacts); setFollowups(f.followups); setThreads(t.threads);
        setProducts(p.products); setStockValue(p.stock_value); setLowCount(p.low_count);
        setTickets(tk.tickets); setTicketCounts(tk.counts);
        setInvoices(iv.invoices); setInvCounts(iv.counts); setReceivables(iv.receivables);
      } catch (e) {
        console.error(e);
        localStorage.removeItem(tokenKey);
        setToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const login = async (email, password) => {
    const d = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    localStorage.setItem(tokenKey, d.token);
    setAuthMode('landing');
    setView('dashboard');
    setToken(d.token);
  };
  const register = async (email, password, name, business_name) => {
    const d = await api('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, name, business_name }) });
    localStorage.setItem(tokenKey, d.token);
    setAuthMode('landing');
    setView('dashboard');
    setToken(d.token);
  };
  const logout = () => { localStorage.removeItem(tokenKey); setToken(null); setAuthMode('landing'); setDash(null); setContacts([]); };

  const fmt = (n) => '₦' + Number(n).toLocaleString();

  if (loading) return <div className="center">Loading…</div>;

  if (!token) {
    if (authMode === 'landing') return <Landing onLogin={() => setAuthMode('login')} onStart={() => setAuthMode('register')} />;
    return (
      <Login
        mode={authMode}
        onSwitch={(m) => setAuthMode(m)}
        onBack={() => setAuthMode('landing')}
        onLogin={login}
        onRegister={register}
      />
    );
  }

  const openThread = async (t) => {
    setActiveContact(t);
    setDraft('');
    const d = await api(`/messages?contact_id=${t.contact_id}`);
    setMsgs(d.messages);
  };
  const getDraft = async () => {
    const d = await api(`/ai/draft?contact_id=${activeContact.contact_id}`);
    setDraft(d.draft);
  };
  const sendMsg = async () => {
    const body = (draft || composer).trim();
    if (!body) return;
    await api('/messages', { method: 'POST', body: JSON.stringify({ contact_id: activeContact.contact_id, body }) });
    setDraft(''); setComposer('');
    const [m, t] = await Promise.all([
      api(`/messages?contact_id=${activeContact.contact_id}`),
      api('/inbox'),
    ]);
    setMsgs(m.messages); setThreads(t.threads);
  };
  const backToThreads = () => { setActiveContact(null); setMsgs([]); setDraft(''); };

  const openInvoice = async (i) => {
    const d = await api(`/invoices/${i.id}`);
    setActiveInv(d.invoice); setInvItems(d.items); setInvView('detail');
  };
  const sendInvoice = async () => {
    await api(`/invoices/${activeInv.id}/send`, { method: 'POST' });
    const d = await api('/invoices');
    setInvoices(d.invoices); setInvCounts(d.counts); setReceivables(d.receivables);
    setActiveInv({ ...activeInv, status: 'sent' });
  };
  const payInvoice = async () => {
    await api(`/invoices/${activeInv.id}/paid`, { method: 'POST' });
    const d = await api('/invoices');
    setInvoices(d.invoices); setInvCounts(d.counts); setReceivables(d.receivables);
    setActiveInv({ ...activeInv, status: 'paid' });
  };
  const newInvoice = () => {
    setInvView('new');
    setNewInv({ contact_id: '', due_date: '', items: [{ description: '', qty: 1, unit_price: '' }] });
  };
  const saveInvoice = async () => {
    if (!newInv.contact_id || newInv.items.length === 0) return;
    await api('/invoices', { method: 'POST', body: JSON.stringify(newInv) });
    const d = await api('/invoices');
    setInvoices(d.invoices); setInvCounts(d.counts); setReceivables(d.receivables);
    setNewInv(null); setInvView('list');
  };

  const nav = [
    ['dashboard', '🏠', 'Dashboard'],
    ['customers', '👥', 'Customers'],
    ['inbox', '💬', 'Inbox'],
    ['invoices', '🧾', 'Invoicing'],
    ['followups', '📞', 'Follow-ups'],
    ['ads', '📣', 'Ads Studio'],
  ];

  const depts = [
    ['sales', '📈 Sales'],
    ['support', '🛟 Support'],
    ['inventory', '📦 Inventory'],
    ['product', '🏷️ Product'],
  ];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo"><div className="logo-mark">O</div><div><b>OmniCRM</b><span>beta</span></div></div>
        {nav.map(([k, icon, label]) => (
          <div key={k} className={`nav-item ${view === k ? 'active' : ''}`} onClick={() => setView(k)}>
            <span>{icon}</span>{label}
          </div>
        ))}
        <div className="nav-item" onClick={logout}>🚪 Log out</div>
      </aside>

      <main className="main">
        <div className="mobile-topbar">
          <div className="logo"><div className="logo-mark">O</div><div><b>OmniCRM</b><span>beta</span></div></div>
          <button className="btn-ghost sm" onClick={logout}>🚪 Log out</button>
        </div>
        {view === 'dashboard' && dash && (
          <>
            <h1>Good morning 👋</h1>
            <div className="dept-pills">
              {depts.map(([k, label]) => (
                <button key={k} className={`pill ${dept === k ? 'active' : ''}`} onClick={() => setDept(k)}>{label}</button>
              ))}
            </div>

            {dept === 'sales' && (
              <>
                <div className="kpis">
                  <div className="kpi"><div className="label">Contacts</div><div className="value">{dash.contacts}</div></div>
                  <div className="kpi"><div className="label">Outstanding debts</div><div className="value">{fmt(dash.debtors)}</div><div className="sub">{dash.debtor_count} debtors</div></div>
                  <div className="kpi"><div className="label">Pipeline</div><div className="value">{fmt(dash.pipeline_value_ngn)}</div></div>
                  <div className="kpi"><div className="label">Follow-ups due today</div><div className="value">{dash.followups_due_today}</div></div>
                </div>
                {followups.length > 0 && (
                  <div className="card">
                    <h3>✦ AI Follow-ups ready</h3>
                    {followups.map((f) => (
                      <div key={f.contact_id} className="followup">
                        <b>{f.company || f.name}</b>
                        <p>{f.draft}</p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="quick-actions">
                  <button className="btn-primary" onClick={() => setView('customers')}>Open Customer Book →</button>
                  <button className="btn-ghost" onClick={() => setView('inbox')}>Open WhatsApp Inbox →</button>
                </div>
              </>
            )}

            {dept === 'support' && (
              <>
                <div className="kpis">
                  <div className="kpi"><div className="label">Open tickets</div><div className="value">{ticketCounts.open || 0}</div></div>
                  <div className="kpi"><div className="label">Pending</div><div className="value">{ticketCounts.pending || 0}</div></div>
                  <div className="kpi"><div className="label">Closed</div><div className="value">{ticketCounts.closed || 0}</div></div>
                  <div className="kpi"><div className="label">Inbox unread</div><div className="value">{threads.reduce((s, t) => s + (t.unread || 0), 0)}</div></div>
                </div>
                <div className="card">
                  <h3>🛟 Support Tickets</h3>
                  {tickets.map((t) => (
                    <div key={t.id} className="ticket">
                      <div className="ticket-info">
                        <b>{t.subject}</b>
                        <span>{t.company || t.name || 'General'} · {t.created_at}</span>
                      </div>
                      <span className={`chip ${t.status}`}>{t.status}</span>
                      <span className={`chip pri-${t.priority}`}>{t.priority}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {dept === 'inventory' && (
              <>
                <div className="kpis">
                  <div className="kpi"><div className="label">Stock value (cost)</div><div className="value">{fmt(stockValue)}</div></div>
                  <div className="kpi"><div className="label">Low-stock alerts</div><div className="value">{lowCount}</div></div>
                  <div className="kpi"><div className="label">SKUs tracked</div><div className="value">{products.length}</div></div>
                </div>
                <div className="card">
                  <h3>⚠️ Low Stock</h3>
                  {products.filter((p) => p.low).map((p) => (
                    <div key={p.id} className="ticket">
                      <div className="ticket-info"><b>{p.name}</b><span>{p.sku} · {p.category}</span></div>
                      <span className="chip low">{p.stock} left</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {dept === 'product' && (
              <div className="card">
                <h3>🏷️ Product Catalog</h3>
                {products.map((p) => (
                  <div key={p.id} className="prod">
                    <div className="ticket-info"><b>{p.name}</b><span>{p.sku} · {p.category}</span></div>
                    <div className="prod-meta">
                      <div><span className="muted">Stock</span> {p.stock}</div>
                      <div><span className="muted">Price</span> {fmt(p.unit_price)}</div>
                      <div><span className="muted">Margin</span> {p.margin}%</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {view === 'customers' && (
          <div className="card">
            <h3>Customer Book ({contacts.length})</h3>
            {contacts.map((c) => (
              <div key={c.id} className="cust">
                <div className="cust-info"><b>{c.company || c.name}</b><span>{c.phone} · {c.status} · {c.tags}</span></div>
                {c.deal_value_ngn > 0 && <div className="amt">{fmt(c.deal_value_ngn)}</div>}
                {c.debt_ngn > 0 && <div className="debt">{fmt(c.debt_ngn)}</div>}
              </div>
            ))}
          </div>
        )}

        {view === 'inbox' && (
          <div className="card inbox">
            {!activeContact ? (
              <>
                <h3>💬 WhatsApp Inbox</h3>
                {threads.length === 0 && <p className="muted">No conversations yet.</p>}
                {threads.map((t) => (
                  <div key={t.contact_id} className="thread" onClick={() => openThread(t)}>
                    <div className="thread-ava">{((t.company || t.name) || '?')[0]}</div>
                    <div className="thread-info">
                      <b>{t.company || t.name}</b>
                      <span>{t.last_message}</span>
                    </div>
                    {t.unread > 0 && <div className="unread-badge">{t.unread}</div>}
                  </div>
                ))}
              </>
            ) : (
              <div className="convo">
                <div className="convo-head">
                  <button className="btn-ghost" onClick={backToThreads}>←</button>
                  <div className="thread-ava">{((activeContact.company || activeContact.name) || '?')[0]}</div>
                  <div><b>{activeContact.company || activeContact.name}</b><span className="muted">{activeContact.phone || 'WhatsApp'}</span></div>
                </div>
                <div className="bubbles">
                  {msgs.map((m) => (
                    <div key={m.id} className={`bubble ${m.direction === 'in' ? 'in' : 'out'}`}>{m.body}</div>
                  ))}
                  {draft && (
                    <div className="bubble draft">
                      <b>✦ AI DRAFT — approve to send</b>
                      {draft}
                      <div className="draft-acts">
                        <button className="btn-primary sm" onClick={sendMsg}>Approve & Send</button>
                        <button className="btn-ghost sm" onClick={() => { setComposer(draft); setDraft(''); }}>Edit</button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="composer">
                  <button className="btn-ghost sm" onClick={getDraft}>✦ AI Draft</button>
                  <input
                    placeholder="Type a message…"
                    value={composer}
                    onChange={(e) => setComposer(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') sendMsg(); }}
                  />
                  <button className="btn-primary sm" onClick={sendMsg}>Send</button>
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'invoices' && (
          <div className="card">
            {invView === 'list' && (
              <>
                <div className="inv-head">
                  <h3>🧾 Invoicing</h3>
                  <button className="btn-primary sm" onClick={newInvoice}>+ New Invoice</button>
                </div>
                <div className="kpis">
                  <div className="kpi"><div className="label">Receivables</div><div className="value">{fmt(receivables)}</div></div>
                  <div className="kpi"><div className="label">Overdue</div><div className="value">{invCounts.overdue || 0}</div></div>
                  <div className="kpi"><div className="label">Sent</div><div className="value">{invCounts.sent || 0}</div></div>
                  <div className="kpi"><div className="label">Paid</div><div className="value">{invCounts.paid || 0}</div></div>
                </div>
                {invoices.map((i) => (
                  <div key={i.id} className="thread" onClick={() => openInvoice(i)}>
                    <div className="thread-ava">🧾</div>
                    <div className="thread-info">
                      <b>{i.number} · {i.company || i.name}</b>
                      <span>Due {i.due_date} · VAT ₦{Number(i.tax).toLocaleString()}</span>
                    </div>
                    <div className="inv-amt">{fmt(i.total)}</div>
                    <span className={`chip ${i.status}`}>{i.status}</span>
                  </div>
                ))}
              </>
            )}

            {invView === 'new' && newInv && (
              <>
                <h3>New Invoice</h3>
                <select value={newInv.contact_id} onChange={(e) => setNewInv({ ...newInv, contact_id: e.target.value })}>
                  <option value="">Select customer…</option>
                  {contacts.map((c) => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
                </select>
                <label className="inv-label">Due date</label>
                <input type="date" value={newInv.due_date} onChange={(e) => setNewInv({ ...newInv, due_date: e.target.value })} />
                <label className="inv-label">Items</label>
                {newInv.items.map((it, idx) => (
                  <div key={idx} className="inv-item-row">
                    <input
                      placeholder="Description"
                      value={it.description}
                      onChange={(e) => {
                        const items = [...newInv.items];
                        items[idx] = { ...it, description: e.target.value };
                        setNewInv({ ...newInv, items });
                      }}
                    />
                    <input
                      type="number" min="1" placeholder="Qty" style={{ width: 64 }}
                      value={it.qty}
                      onChange={(e) => {
                        const items = [...newInv.items];
                        items[idx] = { ...it, qty: e.target.value };
                        setNewInv({ ...newInv, items });
                      }}
                    />
                    <input
                      type="number" min="0" placeholder="Unit ₦" style={{ width: 100 }}
                      value={it.unit_price}
                      onChange={(e) => {
                        const items = [...newInv.items];
                        items[idx] = { ...it, unit_price: e.target.value };
                        setNewInv({ ...newInv, items });
                      }}
                    />
                    <button className="btn-ghost sm" onClick={() => setNewInv({ ...newInv, items: newInv.items.filter((_, j) => j !== idx) })}>✕</button>
                  </div>
                ))}
                <button className="btn-ghost sm" onClick={() => setNewInv({ ...newInv, items: [...newInv.items, { description: '', qty: 1, unit_price: '' }] })}>+ Add item</button>
                <div className="quick-actions">
                  <button className="btn-primary" onClick={saveInvoice}>Save invoice (7.5% VAT added)</button>
                  <button className="btn-ghost" onClick={() => setInvView('list')}>Cancel</button>
                </div>
              </>
            )}

            {invView === 'detail' && activeInv && (
              <>
                <div className="convo-head">
                  <button className="btn-ghost" onClick={() => setInvView('list')}>←</button>
                  <div><b>{activeInv.number}</b><span className="muted">{activeInv.company || activeInv.name} · issued {activeInv.issue_date} · due {activeInv.due_date}</span></div>
                  <span className={`chip ${activeInv.status}`}>{activeInv.status}</span>
                </div>
                <div className="inv-items">
                  {invItems.map((it) => (
                    <div key={it.id} className="inv-line">
                      <span>{it.description} × {it.qty}</span>
                      <span>{fmt(it.amount)}</span>
                    </div>
                  ))}
                  <div className="inv-line muted"><span>Subtotal</span><span>{fmt(activeInv.subtotal)}</span></div>
                  <div className="inv-line muted"><span>VAT (7.5%)</span><span>{fmt(activeInv.tax)}</span></div>
                  <div className="inv-line total"><span>Total</span><span>{fmt(activeInv.total)}</span></div>
                </div>
                <div className="quick-actions">
                  {activeInv.status === 'draft' && <button className="btn-primary" onClick={sendInvoice}>Mark as sent</button>}
                  {(activeInv.status === 'sent' || activeInv.status === 'overdue') && <button className="btn-primary" onClick={payInvoice}>Mark as paid ✓</button>}
                </div>
              </>
            )}
          </div>
        )}

        {view === 'followups' && (
          <div className="card">
            <h3>Follow-ups</h3>
            {followups.length === 0 && <p className="muted">Nothing due today. 🎉</p>}
            {followups.map((f) => (
              <div key={f.contact_id} className="followup">
                <b>{f.company || f.name}</b> — {f.reason}
                <p>{f.draft}</p>
              </div>
            ))}
          </div>
        )}

        {view === 'ads' && (
          <div className="card ads-card">
            <div className="ads-badge">COMING SOON</div>
            <h3>📣 Ads Studio</h3>
            <p className="muted">Run Meta & Google ads the easy way — the AI plans, builds and optimises while you watch the returns.</p>
            <ul className="ads-list">
              <li>✨ AI builds your ad copy, creative and audience — you just approve</li>
              <li>💳 One naira budget, all-in — our fee is a simple % of your ad spend</li>
              <li>📊 Live analytics: spend, clicks, leads and ROI on every naira</li>
              <li>🤖 Weekly AI recommendations that shift budget to what sells</li>
            </ul>
            <button className="btn-primary" onClick={() => alert('Ads Studio is coming in the next build phase. You are first in line, Grant! 🚀')}>Join the waitlist</button>
          </div>
        )}
      </main>

      <nav className="bottomnav">
        {nav.map(([k, icon, label]) => (
          <div key={k} className={`bn-item ${view === k ? 'active' : ''}`} onClick={() => setView(k)}>
            <span>{icon}</span>{label}
          </div>
        ))}
      </nav>
    </div>
  );
}

function Landing({ onLogin, onStart }) {
  const features = [
    ['📈', 'Sales CRM', 'Pipeline, follow-ups and AI-drafted messages that close deals while you sleep.'],
    ['💬', 'WhatsApp AI Inbox', 'One inbox for every customer chat — the AI drafts, you approve and send.'],
    ['📦', 'Inventory', 'Stock levels, low-stock alerts and stock value, updated in real time.'],
    ['🧾', 'Invoicing', 'Send invoices from your phone, track payments, chase debtors politely.'],
    ['📣', 'Ads Studio', 'AI-run Meta & Google ads with live ROI analytics — pay only a % of ad spend.'],
    ['🛟', 'Support Desk', 'Every complaint becomes a ticket with priority, SLA and history.'],
  ];
  const cats = [
    ['🏪', 'Nano & Micro', 'Corner shops, side hustles — digital tools at naira prices, nothing to learn.'],
    ['🛒', 'Small Business', 'Retailers, salons, pharmacies — run sales, stock and WhatsApp in one app.'],
    ['🏢', 'Medium & Enterprise', 'Facility managers, distributors, franchises — dashboards for every department.'],
  ];
  const tiers = [
    ['Starter', '₦0', 'forever', ['Up to 100 contacts', 'WhatsApp inbox', '5 AI follow-ups / day', 'Community support'], 'Start free'],
    ['Growth', '₦9,900', '/month', ['Everything in Starter', 'Unlimited contacts', 'AI drafts + invoicing', 'Inventory & support desk'], 'Start free trial'],
    ['Pro', '₦24,900', '/month', ['Everything in Growth', 'Ads Studio (10% of spend)', 'Multi-user & departments', 'Priority support'], 'Start free trial'],
    ['Enterprise', 'Custom', 'tailored', ['Unlimited everything', 'Dedicated analyst', 'API access & SSO', 'SLA & onboarding'], 'Talk to us'],
  ];
  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="logo"><div className="logo-mark">O</div><div><b>OmniCRM</b><span>beta</span></div></div>
        <nav className="landing-links">
          <a href="#features">Features</a>
          <a href="#categories">Who it's for</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <button className="btn-ghost" onClick={onLogin}>Log in</button>
      </header>

      <section className="hero">
        <h1>Every business tool your company needs.<br />One app. One naira at a time.</h1>
        <p className="hero-sub">OmniCRM digitalises how nano, micro, small and enterprise businesses sell, support, stock and advertise — with AI doing the heavy lifting.</p>
        <div className="hero-cta">
          <button className="btn-primary big" onClick={onStart}>Start free</button>
          <a className="btn-ghost big" href="#pricing">See pricing</a>
        </div>
      </section>

      <section id="features" className="landing-section">
        <h2>Everything large retailers have — for everyone else</h2>
        <div className="feat-grid">
          {features.map(([icon, title, desc]) => (
            <div key={title} className="feat">
              <div className="feat-icon">{icon}</div>
              <b>{title}</b>
              <p>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="categories" className="landing-section alt">
        <h2>Built for every size of business</h2>
        <div className="cat-grid">
          {cats.map(([icon, title, desc]) => (
            <div key={title} className="feat">
              <div className="feat-icon">{icon}</div>
              <b>{title}</b>
              <p>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="landing-section">
        <h2>Simple pricing, honest money</h2>
        <div className="price-grid">
          {tiers.map(([name, price, per, perks, cta]) => (
            <div key={name} className="price-card">
              <b className="price-name">{name}</b>
              <div className="price-amt">{price}<span>{per}</span></div>
              <ul>
                {perks.map((p) => <li key={p}>✓ {p}</li>)}
              </ul>
              <button className={name === 'Pro' ? 'btn-primary' : 'btn-ghost'} onClick={onStart}>{cta}</button>
            </div>
          ))}
        </div>
        <p className="muted pricing-note">Ads Studio: no fixed fee — you pay a simple percentage of ad spend, and every campaign reports its ROI.</p>
      </section>

      <footer className="landing-footer">
        <div className="logo"><div className="logo-mark">O</div><div><b>OmniCRM</b><span>beta</span></div></div>
        <p className="muted">Made for Nigerian businesses · Lagos, Nigeria</p>
        <p className="muted">© 2026 OmniCRM</p>
      </footer>
    </div>
  );
}

function Login({ mode, onSwitch, onBack, onLogin, onRegister }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [business, setBusiness] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      if (mode === 'login') await onLogin(email, password);
      else await onRegister(email, password, name, business);
    } catch (e2) { setErr(e2.message); }
  };
  return (
    <div className="center login">
      <div className="card login-card">
        <button className="btn-ghost back" onClick={onBack}>← Back</button>
        <div className="logo"><div className="logo-mark">O</div><div><b>OmniCRM</b><span>beta</span></div></div>
        <h3>{mode === 'login' ? 'Welcome back' : 'Create your business'}</h3>
        <form onSubmit={submit}>
          {mode === 'register' && (
            <>
              <input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required />
              <input placeholder="Business name" value={business} onChange={(e) => setBusiness(e.target.value)} />
            </>
          )}
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {err && <p className="err">{err}</p>}
          <button className="btn-primary" type="submit">{mode === 'login' ? 'Log in' : 'Create account'}</button>
        </form>
        <p className="muted switch" onClick={() => onSwitch(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'New here? Create an account' : 'Have an account? Log in'}
        </p>
        <p className="muted demo">Demo: grant@besconpaints.com / omnicrm-demo</p>
      </div>
    </div>
  );
}
