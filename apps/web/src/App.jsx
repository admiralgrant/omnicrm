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
  const [payLink, setPayLink] = useState('');
  const [fx, setFx] = useState(null);
  const [prodView, setProdView] = useState('list'); // list | form
  const [prodForm, setProdForm] = useState(null);
  const [custView, setCustView] = useState('list'); // list | form
  const [custForm, setCustForm] = useState(null);
  const [tktView, setTktView] = useState('list'); // list | form
  const [tktForm, setTktForm] = useState(null);
  const [feedback, setFeedback] = useState([]);
  const [fbForm, setFbForm] = useState({ contact_id: '', body: '' });
  const [fbOpen, setFbOpen] = useState(false);
  const [pipeline, setPipeline] = useState(null);
  const [pipeStage, setPipeStage] = useState('lead');
  const [report, setReport] = useState(null);
  const [reportPeriod, setReportPeriod] = useState('daily');
  const [reportLoading, setReportLoading] = useState(false);
  const [deptReport, setDeptReport] = useState(null); // {scope, sections}
  const [account, setAccount] = useState(null);
  const [me, setMe] = useState(() => {
    const t = localStorage.getItem(tokenKey);
    if (!t) return null;
    try { return JSON.parse(atob(t.split('.')[1])); } catch { return null; }
  }); // {name, dept, staff} — department-scoped login
  const [orgFeats, setOrgFeats] = useState(null);
  const [hr, setHr] = useState(null);
  const [hrTab, setHrTab] = useState('staff');
  const [hrForm, setHrForm] = useState(null); // add/edit staff
  const [advForm, setAdvForm] = useState(null);
  const [leaveForm, setLeaveForm] = useState(null);
  const [invEdit, setInvEdit] = useState(null); // draft invoice edit state
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    (async () => {
      try {
        const [d, c, f, t, p, tk, iv, fxD, fb, pl, ac] = await Promise.all([
          api('/dashboard'), api('/contacts'), api('/ai/followups'), api('/inbox'),
          api('/products'), api('/tickets'), api('/invoices'), api('/fx'),
          api('/feedback'), api('/pipeline'), api('/account'),
        ]);
        setDash(d.kpis); setContacts(c.contacts); setFollowups(f.followups); setThreads(t.threads);
        setProducts(p.products); setStockValue(p.stock_value); setLowCount(p.low_count);
        setTickets(tk.tickets); setTicketCounts(tk.counts);
        setInvoices(iv.invoices); setInvCounts(iv.counts); setReceivables(iv.receivables);
        setFx(fxD);
        setFeedback(fb.feedback); setPipeline(pl); setAccount(ac);
        try { setOrgFeats((await api('/org/features')).features); } catch { /* staff-safe */ }
        try { setHr(await api('/hr-dashboard')); } catch { /* non-HR staff */ }
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
    setMe(d.user);
    setToken(d.token);
  };
  const register = async (email, password, name, business_name) => {
    const d = await api('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, name, business_name }) });
    localStorage.setItem(tokenKey, d.token);
    setAuthMode('landing');
    setView('dashboard');
    setMe(d.user);
    setToken(d.token);
  };
  const logout = () => { localStorage.removeItem(tokenKey); setToken(null); setAuthMode('landing'); setDash(null); setContacts([]); };

  const fmt = (n) => '₦' + Number(n).toLocaleString();
  const CURS = { NGN: '₦', USD: '$', EUR: '€', GBP: '£' };
  const fmtCur = (n, cur) => (CURS[cur || 'NGN'] || '₦') + Number(n).toLocaleString();

  const FRONT_ACCESS = {
    sales: ['dashboard', 'sales', 'customers', 'inbox', 'invoices', 'followups', 'feedback', 'reports', 'pipeline'],
    support: ['dashboard', 'support', 'inbox', 'feedback', 'reports'],
    inventory: ['dashboard', 'inventory', 'product', 'reports'],
    hr: ['dashboard', 'hr', 'reports'],
    account: ['dashboard', 'invoices', 'reports'],
  };
  const allowed = (section) => {
    if (orgFeats && orgFeats[section] === false) return false;
    if (!me || !me.dept) return true;
    return (FRONT_ACCESS[me.dept] || []).includes(section);
  };

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
    setActiveInv(d.invoice); setInvItems(d.items); setPayLink(d.pay_link || ''); setInvView('detail');
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
    setNewInv({ contact_id: '', due_date: '', currency: 'NGN', items: [{ description: '', qty: 1, unit_price: '' }] });
    api('/fx').then(setFx).catch(() => {});
  };
  const shareWhatsApp = () => {
    const intl = String(activeInv.phone || '').replace(/^0/, '234');
    const link = `${location.origin}${payLink}`;
    const lines = invItems.map((it) => `• ${it.description} × ${it.qty} — ${fmtCur(it.amount, activeInv.currency)}`).join('\n');
    const feeLine = activeInv.fee > 0 ? `\nProcessing fee: ${fmtCur(activeInv.fee, activeInv.currency)}` : '';
    const equiv = activeInv.currency !== 'NGN' ? `\n(≈ ${fmt(activeInv.ngn_total)})` : '';
    const msg = `Hello, here is your invoice ${activeInv.number} from Bescon Paints.\n\n${lines}\n\nTotal: ${fmtCur(activeInv.total + (activeInv.fee || 0), activeInv.currency)} (incl. 7.5% VAT${activeInv.fee > 0 ? ' + processing fee' : ''})${equiv}\nDue: ${activeInv.due_date}\n\nPay securely online here:\n${link}`;
    window.open(`https://wa.me/${intl}?text=${encodeURIComponent(msg)}`, '_blank');
  };
  const copyPayLink = () => {
    const link = `${location.origin}${payLink}`;
    navigator.clipboard.writeText(link);
    alert(`Pay link copied:\n${link}`);
  };
  const downloadPdf = async () => {
    const res = await fetch(`${API}/invoices/${activeInv.id}/pdf`, { headers: { Authorization: `Bearer ${localStorage.getItem(tokenKey)}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeInv.number}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  const emailInvoice = () => {
    const link = `${location.origin}${payLink}`;
    const lines = invItems.map((it) => `• ${it.description} × ${it.qty} — ${fmtCur(it.amount, activeInv.currency)}`).join('\n');
    const feeLine = activeInv.fee > 0 ? `\nProcessing fee: ${fmtCur(activeInv.fee, activeInv.currency)}` : '';
    const equiv = activeInv.currency !== 'NGN' ? `\n(≈ ${fmt(activeInv.ngn_total)})` : '';
    const subject = `Invoice ${activeInv.number} from ${activeInv.company || 'us'}`;
    const body = `Hello,\n\nPlease find invoice ${activeInv.number} below.\n\n${lines}\n\nSubtotal: ${fmtCur(activeInv.subtotal, activeInv.currency)}\nVAT (7.5%): ${fmtCur(activeInv.tax, activeInv.currency)}${feeLine}\nTotal due: ${fmtCur(activeInv.total + (activeInv.fee || 0), activeInv.currency)}${equiv}\nDue: ${activeInv.due_date}\n\nPay securely online:\n${link}`;
    window.location.href = `mailto:${activeInv.email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };
  const saveInvoice = async () => {
    if (!newInv.contact_id || newInv.items.length === 0) return;
    await api('/invoices', { method: 'POST', body: JSON.stringify(newInv) });
    const d = await api('/invoices');
    setInvoices(d.invoices); setInvCounts(d.counts); setReceivables(d.receivables);
    setNewInv(null); setInvView('list');
  };
  const refreshProducts = async () => {
    const p = await api('/products');
    setProducts(p.products); setStockValue(p.stock_value); setLowCount(p.low_count);
  };
  const openNewProduct = () => {
    setProdForm({ id: null, name: '', sku: '', category: 'Emulsion', stock: 0, low_stock_at: 5, unit_cost: 0, unit_price: 0 });
    setProdView('form');
  };
  const openEditProduct = (p) => {
    setProdForm({ id: p.id, name: p.name, sku: p.sku || '', category: p.category, stock: p.stock, low_stock_at: p.low_stock_at, unit_cost: p.unit_cost, unit_price: p.unit_price });
    setProdView('form');
  };
  const saveProduct = async () => {
    const { id, ...fields } = prodForm;
    const body = JSON.stringify(fields);
    if (id) await api(`/products/${id}`, { method: 'PUT', body });
    else await api('/products', { method: 'POST', body });
    await refreshProducts();
    setProdView('list'); setProdForm(null);
  };
  const deleteProduct = async () => {
    if (!window.confirm(`Delete ${prodForm.name} from the catalog?`)) return;
    await api(`/products/${prodForm.id}`, { method: 'DELETE' });
    await refreshProducts();
    setProdView('list'); setProdForm(null);
  };
  const refreshContacts = async () => {
    const c = await api('/contacts');
    setContacts(c.contacts);
  };
  const openNewCustomer = () => {
    setCustForm({ id: null, name: '', company: '', phone: '', email: '', tags: 'lead', status: 'lead', deal_value_ngn: 0, debt_ngn: 0 });
    setCustView('form');
  };
  const openEditCustomer = (c) => {
    setCustForm({ id: c.id, name: c.name, company: c.company || '', phone: c.phone || '', email: c.email || '', tags: c.tags || '', status: c.status || 'lead', deal_value_ngn: c.deal_value_ngn || 0, debt_ngn: c.debt_ngn || 0 });
    setCustView('form');
  };
  const saveCustomer = async () => {
    const { id, ...fields } = custForm;
    if (!fields.name && !fields.company) return;
    const body = JSON.stringify(fields);
    if (id) await api(`/contacts/${id}`, { method: 'PUT', body });
    else await api('/contacts', { method: 'POST', body });
    await refreshContacts();
    setCustView('list'); setCustForm(null);
  };
  const deleteCustomer = async () => {
    if (!window.confirm(`Delete ${custForm.company || custForm.name}? Their messages and invoices will remain but be orphaned.`)) return;
    await api(`/contacts/${custForm.id}`, { method: 'DELETE' });
    await refreshContacts();
    setCustView('list'); setCustForm(null);
  };
  const refreshTickets = async () => {
    const t = await api('/tickets');
    setTickets(t.tickets); setTicketCounts(t.counts);
  };
  const openNewTicket = () => {
    setTktForm({ id: null, subject: '', contact_id: '', priority: 'medium', status: 'open' });
    setTktView('form');
  };
  const openEditTicket = (t) => {
    setTktForm({ id: t.id, subject: t.subject, contact_id: t.contact_id || '', priority: t.priority, status: t.status });
    setTktView('form');
  };
  const saveTicket = async () => {
    if (!tktForm.subject) return;
    const { id, ...fields } = tktForm;
    const body = JSON.stringify({ ...fields, contact_id: fields.contact_id || null });
    if (id) await api(`/tickets/${id}`, { method: 'PUT', body });
    else await api('/tickets', { method: 'POST', body });
    await refreshTickets();
    setTktView('list'); setTktForm(null);
  };
  const deleteTicket = async () => {
    if (!window.confirm(`Delete ticket "${tktForm.subject}"?`)) return;
    await api(`/tickets/${tktForm.id}`, { method: 'DELETE' });
    await refreshTickets();
    setTktView('list'); setTktForm(null);
  };
  const refreshFeedback = async () => {
    const f = await api('/feedback');
    setFeedback(f.feedback);
  };
  const saveFeedback = async () => {
    if (!fbForm.body.trim()) return;
    await api('/feedback', { method: 'POST', body: JSON.stringify({ contact_id: fbForm.contact_id || null, body: fbForm.body }) });
    setFbForm({ contact_id: '', body: '' });
    await refreshFeedback();
  };
  const deleteFeedback = async (id) => {
    if (!window.confirm('Delete this feedback note?')) return;
    await api(`/feedback/${id}`, { method: 'DELETE' });
    await refreshFeedback();
  };
  const moveStage = async (c, dir) => {
    const order = ['lead', 'contacted', 'qualified', 'proposal_sent', 'negotiation', 'won', 'lost'];
    const idx = order.indexOf(c.status);
    const next = order[Math.max(0, Math.min(order.length - 1, idx + dir))];
    await api(`/contacts/${c.id}`, { method: 'PUT', body: JSON.stringify({ status: next }) });
    const [pl, cs] = await Promise.all([api('/pipeline'), api('/contacts')]);
    setPipeline(pl); setContacts(cs.contacts);
  };
  const generateReport = async () => {
    setReportLoading(true);
    try {
      const r = await api(`/ai/report?period=${reportPeriod}`);
      setReport(r);
    } finally {
      setReportLoading(false);
    }
  };
  const generateDeptReport = async (scope) => {
    const apiScope = scope === 'product' ? 'inventory' : scope;
    const r = await api(`/ai/report?period=${reportPeriod}&scope=${apiScope}`);
    setDeptReport({ scope, sections: r.sections, generated_at: r.generated_at });
  };
  const openInvEdit = (inv, items) => {
    setInvEdit({
      id: inv.id,
      due_date: inv.due_date,
      currency: inv.currency,
      items: items.map((it) => ({ description: it.description, qty: it.qty, unit_price: it.unit_price })),
    });
  };
  const saveInvEdit = async () => {
    await api(`/invoices/${invEdit.id}`, { method: 'PUT', body: JSON.stringify({ due_date: invEdit.due_date, currency: invEdit.currency, items: invEdit.items }) });
    const [iv, det] = await Promise.all([api('/invoices'), api(`/invoices/${invEdit.id}`)]);
    setInvoices(iv.invoices); setInvCounts(iv.counts); setReceivables(iv.receivables);
    setActiveInv(det.invoice); setInvItems(det.items);
    setInvEdit(null);
  };

  const nav = [
    ['dashboard', '🏠', 'Dashboard'],
    ['customers', '👥', 'Customers'],
    ['inbox', '💬', 'Inbox'],
    ['invoices', '🧾', 'Invoicing'],
    ['followups', '📞', 'Follow-ups'],
    ['feedback', '📝', 'Feedback'],
    ['reports', '📊', 'Reports'],
    ['ads', '📣', 'Ads Studio'],
  ];

  const depts = [
    ['sales', '📈 Sales'],
    ['support', '🛟 Support'],
    ['inventory', '📦 Inventory'],
    ['product', '🏷️ Product'],
    ['hr', '🧑💼 HR'],
    ['account', '👤 Account'],
  ];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo"><div className="logo-mark">O</div><div><b>OmniCRM</b><span>beta</span></div></div>
        {nav.filter(([k]) => allowed(k)).map(([k, icon, label]) => (
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
            <h1>Good morning{me?.name ? `, ${me.name.split(' ')[0]}` : ''} 👋{me?.dept ? <span className="dept-tag">{me.dept}</span> : null}</h1>
            <div className="dept-pills">
              {depts.filter(([k]) => allowed(k)).map(([k, label]) => (
                <button key={k} className={`pill ${dept === k ? 'active' : ''}`} onClick={() => setDept(k)}>{label}</button>
              ))}
            </div>
            <div className="quick-actions" style={{ marginTop: 0, marginBottom: 14 }}>
              <button className="btn-ghost sm" onClick={() => generateDeptReport(dept)}>📊 {reportPeriod} report for this section</button>
            </div>
            {deptReport && deptReport.scope === dept && (
              <div className="card report">
                {deptReport.sections.map((s) => (
                  <div key={s.scope}>
                    <h3>{s.title}</h3>
                    <ul className="ads-list">
                      {s.summary.map((line, i) => <li key={i}>{line}</li>)}
                    </ul>
                    {s.rows.slice(0, 6).map((r, i) => (
                      <div key={i} className="inv-line muted">
                        <span>{(r.body || '').slice(0, 64)}</span>
                        <span>{r.status || ''}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

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
                {pipeline && (
                  <div className="card">
                    <h3>🔁 Sales Pipeline</h3>
                    <div className="dept-pills">
                      {pipeline.stages.map((s) => (
                        <button key={s.stage} className={`pill ${pipeStage === s.stage ? 'active' : ''}`} onClick={() => setPipeStage(s.stage)}>
                          {s.stage.replace('_', ' ')} · {s.count}
                        </button>
                      ))}
                    </div>
                    {pipeline.stages.find((s) => s.stage === pipeStage)?.contacts.map((c) => (
                      <div key={c.id} className="inv-row">
                        <div className="thread-ava">{(c.company || c.name || '?')[0]}</div>
                        <div className="thread-info">
                          <b>{c.company || c.name}</b>
                          <span>{c.phone} · {c.tags}</span>
                        </div>
                        <div className="inv-right">
                          {c.deal_value_ngn > 0 && <div className="amt">{fmt(c.deal_value_ngn)}</div>}
                          <div className="quick-actions">
                            {pipeStage !== 'lead' && <button className="btn-ghost sm" onClick={() => moveStage(c, -1)}>◂</button>}
                            {pipeStage !== 'lost' && pipeStage !== 'won' && <button className="btn-primary sm" onClick={() => moveStage(c, 1)}>Advance ▸</button>}
                          </div>
                        </div>
                      </div>
                    ))}
                    {(pipeline.stages.find((s) => s.stage === pipeStage)?.count || 0) === 0 && (
                      <p className="muted">No contacts in this stage.</p>
                    )}
                  </div>
                )}
              </>
            )}

            {dept === 'support' && (tktView === 'form' && tktForm ? (
              <div className="card">
                <h3>{tktForm.id ? '✏️ Edit ticket' : '➕ New ticket'}</h3>
                <label className="inv-label">Subject</label>
                <input placeholder="e.g. Delivery delay on Lekki Phase 2 site" value={tktForm.subject} onChange={(e) => setTktForm({ ...tktForm, subject: e.target.value })} />
                <label className="inv-label">Customer (optional)</label>
                <select value={tktForm.contact_id} onChange={(e) => setTktForm({ ...tktForm, contact_id: e.target.value })}>
                  <option value="">General</option>
                  {contacts.map((c) => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
                </select>
                <div className="inv-item-row">
                  <select value={tktForm.priority} onChange={(e) => setTktForm({ ...tktForm, priority: e.target.value })}>
                    <option value="high">High priority</option>
                    <option value="medium">Medium priority</option>
                    <option value="low">Low priority</option>
                  </select>
                  <select value={tktForm.status} onChange={(e) => setTktForm({ ...tktForm, status: e.target.value })}>
                    <option value="open">Open</option>
                    <option value="pending">Pending</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
                <div className="quick-actions">
                  <button className="btn-primary" onClick={saveTicket}>{tktForm.id ? 'Save changes' : 'Create ticket'}</button>
                  <button className="btn-ghost" onClick={() => { setTktView('list'); setTktForm(null); }}>Cancel</button>
                  {tktForm.id && <button className="btn-ghost" style={{ color: '#c0392b' }} onClick={deleteTicket}>🗑 Delete</button>}
                </div>
              </div>
            ) : (
              <>
                <div className="kpis">
                  <div className="kpi"><div className="label">Open tickets</div><div className="value">{ticketCounts.open || 0}</div></div>
                  <div className="kpi"><div className="label">Pending</div><div className="value">{ticketCounts.pending || 0}</div></div>
                  <div className="kpi"><div className="label">Closed</div><div className="value">{ticketCounts.closed || 0}</div></div>
                  <div className="kpi"><div className="label">Inbox unread</div><div className="value">{threads.reduce((s, t) => s + (t.unread || 0), 0)}</div></div>
                </div>
                <div className="card">
                  <div className="inv-head"><h3>🛟 Support Tickets</h3><button className="btn-primary sm" onClick={openNewTicket}>+ New ticket</button></div>
                  {tickets.map((t) => (
                    <div key={t.id} className="ticket">
                      <div className="ticket-info">
                        <b>{t.subject}</b>
                        <span>{t.company || t.name || 'General'} · {t.created_at}</span>
                      </div>
                      <span className={`chip ${t.status}`}>{t.status}</span>
                      <span className={`chip pri-${t.priority}`}>{t.priority}</span>
                      <button className="btn-ghost sm" onClick={() => openEditTicket(t)}>✏️</button>
                    </div>
                  ))}
                </div>
              </>
            ))}

            {dept === 'inventory' && (prodView === 'form' && prodForm ? (
              <div className="card">
                <h3>{prodForm.id ? '✏️ Edit product' : '➕ Add product'}</h3>
                <label className="inv-label">Product name</label>
                <input placeholder="e.g. Emulsion Paint — Ocean Blue 20L" value={prodForm.name} onChange={(e) => setProdForm({ ...prodForm, name: e.target.value })} />
                <div className="inv-item-row">
                  <input placeholder="SKU" value={prodForm.sku} onChange={(e) => setProdForm({ ...prodForm, sku: e.target.value })} />
                  <input placeholder="Category" value={prodForm.category} onChange={(e) => setProdForm({ ...prodForm, category: e.target.value })} />
                </div>
                <div className="inv-item-row">
                  <input type="number" min="0" placeholder="Stock qty" value={prodForm.stock} onChange={(e) => setProdForm({ ...prodForm, stock: e.target.value })} />
                  <input type="number" min="0" placeholder="Low-stock alert at" value={prodForm.low_stock_at} onChange={(e) => setProdForm({ ...prodForm, low_stock_at: e.target.value })} />
                </div>
                <div className="inv-item-row">
                  <input type="number" min="0" placeholder="Unit cost ₦" value={prodForm.unit_cost} onChange={(e) => setProdForm({ ...prodForm, unit_cost: e.target.value })} />
                  <input type="number" min="0" placeholder="Unit price ₦" value={prodForm.unit_price} onChange={(e) => setProdForm({ ...prodForm, unit_price: e.target.value })} />
                </div>
                <div className="quick-actions">
                  <button className="btn-primary" onClick={saveProduct}>{prodForm.id ? 'Save changes' : 'Add product'}</button>
                  <button className="btn-ghost" onClick={() => { setProdView('list'); setProdForm(null); }}>Cancel</button>
                  {prodForm.id && <button className="btn-ghost" style={{ color: '#c0392b' }} onClick={deleteProduct}>🗑 Delete</button>}
                </div>
              </div>
            ) : (
              <>
                <div className="kpis">
                  <div className="kpi"><div className="label">Stock value (cost)</div><div className="value">{fmt(stockValue)}</div></div>
                  <div className="kpi"><div className="label">Low-stock alerts</div><div className="value">{lowCount}</div></div>
                  <div className="kpi"><div className="label">SKUs tracked</div><div className="value">{products.length}</div></div>
                </div>
                <div className="card">
                  <div className="inv-head"><h3>📦 Inventory</h3><button className="btn-primary sm" onClick={openNewProduct}>+ Add product</button></div>
                  {products.map((p) => (
                    <div key={p.id} className="inv-row">
                      <div className="thread-ava">📦</div>
                      <div className="thread-info">
                        <b>{p.name}</b>
                        <span>{p.sku} · {p.category} · alert at {p.low_stock_at}</span>
                      </div>
                      <div className="inv-right">
                        <div className="inv-amt">{p.stock} units</div>
                        {p.low && <span className="chip low">low stock</span>}
                        <button className="btn-ghost sm" onClick={() => openEditProduct(p)}>✏️ Edit</button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ))}

            {dept === 'product' && (prodView === 'form' && prodForm ? (
              <div className="card">
                <h3>{prodForm.id ? '✏️ Edit product' : '➕ Add product'}</h3>
                <label className="inv-label">Product name</label>
                <input placeholder="e.g. Emulsion Paint — Ocean Blue 20L" value={prodForm.name} onChange={(e) => setProdForm({ ...prodForm, name: e.target.value })} />
                <div className="inv-item-row">
                  <input placeholder="SKU" value={prodForm.sku} onChange={(e) => setProdForm({ ...prodForm, sku: e.target.value })} />
                  <input placeholder="Category" value={prodForm.category} onChange={(e) => setProdForm({ ...prodForm, category: e.target.value })} />
                </div>
                <div className="inv-item-row">
                  <input type="number" min="0" placeholder="Stock qty" value={prodForm.stock} onChange={(e) => setProdForm({ ...prodForm, stock: e.target.value })} />
                  <input type="number" min="0" placeholder="Low-stock alert at" value={prodForm.low_stock_at} onChange={(e) => setProdForm({ ...prodForm, low_stock_at: e.target.value })} />
                </div>
                <div className="inv-item-row">
                  <input type="number" min="0" placeholder="Unit cost ₦" value={prodForm.unit_cost} onChange={(e) => setProdForm({ ...prodForm, unit_cost: e.target.value })} />
                  <input type="number" min="0" placeholder="Unit price ₦" value={prodForm.unit_price} onChange={(e) => setProdForm({ ...prodForm, unit_price: e.target.value })} />
                </div>
                <div className="quick-actions">
                  <button className="btn-primary" onClick={saveProduct}>{prodForm.id ? 'Save changes' : 'Add product'}</button>
                  <button className="btn-ghost" onClick={() => { setProdView('list'); setProdForm(null); }}>Cancel</button>
                  {prodForm.id && <button className="btn-ghost" style={{ color: '#c0392b' }} onClick={deleteProduct}>🗑 Delete</button>}
                </div>
              </div>
            ) : (
              <div className="card">
                <div className="inv-head"><h3>🏷️ Product Catalog</h3><button className="btn-primary sm" onClick={openNewProduct}>+ Add product</button></div>
                {products.map((p) => (
                  <div key={p.id} className="prod">
                    <div className="ticket-info"><b>{p.name}</b><span>{p.sku} · {p.category}</span></div>
                    <div className="prod-meta">
                      <div><span className="muted">Stock</span> {p.stock}</div>
                      <div><span className="muted">Price</span> {fmt(p.unit_price)}</div>
                      <div><span className="muted">Margin</span> {p.margin}%</div>
                    </div>
                    <button className="btn-ghost sm" onClick={() => openEditProduct(p)}>✏️</button>
                  </div>
                ))}
              </div>
            ))}
            {dept === 'hr' && hr && (
              <>
                <div className="kpis">
                  <div className="kpi"><div className="label">Headcount</div><div className="value">{hr.stats.headcount}</div></div>
                  <div className="kpi"><div className="label">Monthly payroll</div><div className="value">{fmt(hr.stats.monthly_payroll)}</div></div>
                  <div className="kpi"><div className="label">Pension (monthly)</div><div className="value">{fmt(hr.stats.monthly_pension)}</div></div>
                  <div className="kpi"><div className="label">Pending advances</div><div className="value">{fmt(hr.stats.pending_advances)}</div><div className="sub">{hr.stats.pending_advance_count} requests</div></div>
                </div>
                <div className="card">
                  <div className="inv-head">
                    <div className="dept-pills" style={{ marginBottom: 0 }}>
                      {[['staff', `Staff (${hr.staff.length})`], ['advances', `Advances (${hr.advances.length})`], ['leaves', `Leave (${hr.leaves.length})`]].map(([k, label]) => (
                        <button key={k} className={`pill ${hrTab === k ? 'active' : ''}`} onClick={() => setHrTab(k)}>{label}</button>
                      ))}
                    </div>
                    {hrTab === 'staff' && <button className="btn-primary sm" onClick={() => setHrForm({ id: null, name: '', email: '', phone: '', department: 'sales', role: '', salary: 0, bank: '', pension_rate: 8, hmo_plan: '', onboarding: 'invited', next_of_kin: '', password: '' })}>+ Add staff</button>}
                    {hrTab === 'advances' && <button className="btn-primary sm" onClick={() => setAdvForm({ staff_id: '', amount: '', reason: '' })}>+ New advance</button>}
                    {hrTab === 'leaves' && <button className="btn-primary sm" onClick={() => setLeaveForm({ staff_id: '', type: 'annual', start_date: '', end_date: '' })}>+ New leave</button>}
                  </div>

                  {hrForm && (
                    <div className="hr-form">
                      <h3 style={{ marginTop: 8 }}>{hrForm.id ? '✏️ Edit staff' : '➕ Add staff'}</h3>
                      <div className="inv-item-row">
                        <input placeholder="Full name" value={hrForm.name} onChange={(e) => setHrForm({ ...hrForm, name: e.target.value })} />
                        <input placeholder="Email" value={hrForm.email} onChange={(e) => setHrForm({ ...hrForm, email: e.target.value })} />
                      </div>
                      <div className="inv-item-row">
                        <input placeholder="Phone" value={hrForm.phone} onChange={(e) => setHrForm({ ...hrForm, phone: e.target.value })} />
                        <select value={hrForm.department} onChange={(e) => setHrForm({ ...hrForm, department: e.target.value })}>
                          <option value="sales">Sales</option>
                          <option value="support">Support</option>
                          <option value="inventory">Inventory</option>
                          <option value="hr">HR</option>
                          <option value="account">Account</option>
                        </select>
                      </div>
                      <div className="inv-item-row">
                        <input placeholder="Role" value={hrForm.role} onChange={(e) => setHrForm({ ...hrForm, role: e.target.value })} />
                        <input type="number" placeholder="Salary ₦/month" value={hrForm.salary} onChange={(e) => setHrForm({ ...hrForm, salary: e.target.value })} />
                      </div>
                      <div className="inv-item-row">
                        <input placeholder="Bank" value={hrForm.bank} onChange={(e) => setHrForm({ ...hrForm, bank: e.target.value })} />
                        <input type="number" placeholder="Pension %" value={hrForm.pension_rate} onChange={(e) => setHrForm({ ...hrForm, pension_rate: e.target.value })} />
                      </div>
                      <div className="inv-item-row">
                        <input placeholder="HMO plan" value={hrForm.hmo_plan} onChange={(e) => setHrForm({ ...hrForm, hmo_plan: e.target.value })} />
                        <select value={hrForm.onboarding} onChange={(e) => setHrForm({ ...hrForm, onboarding: e.target.value })}>
                          <option value="invited">Invited</option>
                          <option value="documents">Documents</option>
                          <option value="orientation">Orientation</option>
                          <option value="active">Active</option>
                        </select>
                      </div>
                      <div className="inv-item-row">
                        <input placeholder="Next of kin" value={hrForm.next_of_kin} onChange={(e) => setHrForm({ ...hrForm, next_of_kin: e.target.value })} />
                        <input placeholder="Login password (optional)" value={hrForm.password} onChange={(e) => setHrForm({ ...hrForm, password: e.target.value })} />
                      </div>
                      <div className="quick-actions">
                        <button className="btn-primary" onClick={async () => {
                          const { id, ...fields } = hrForm;
                          const body = JSON.stringify({ ...fields, password: fields.password || undefined });
                          if (id) await api(`/staff/${id}`, { method: 'PUT', body });
                          else await api('/staff', { method: 'POST', body });
                          setHr(await api('/hr-dashboard'));
                          setHrForm(null);
                        }}>{hrForm.id ? 'Save changes' : 'Add staff'}</button>
                        <button className="btn-ghost" onClick={() => setHrForm(null)}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {advForm && (
                    <div className="hr-form">
                      <h3 style={{ marginTop: 8 }}>➕ Salary advance</h3>
                      <select value={advForm.staff_id} onChange={(e) => setAdvForm({ ...advForm, staff_id: e.target.value })}>
                        <option value="">Select staff…</option>
                        {hr.staff.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.role}</option>)}
                      </select>
                      <div className="inv-item-row">
                        <input type="number" placeholder="Amount ₦" value={advForm.amount} onChange={(e) => setAdvForm({ ...advForm, amount: e.target.value })} />
                        <input placeholder="Reason" value={advForm.reason} onChange={(e) => setAdvForm({ ...advForm, reason: e.target.value })} />
                      </div>
                      <div className="quick-actions">
                        <button className="btn-primary" onClick={async () => {
                          await api('/salary-advances', { method: 'POST', body: JSON.stringify(advForm) });
                          setHr(await api('/hr-dashboard'));
                          setAdvForm(null);
                        }}>Request advance</button>
                        <button className="btn-ghost" onClick={() => setAdvForm(null)}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {leaveForm && (
                    <div className="hr-form">
                      <h3 style={{ marginTop: 8 }}>➕ Leave request</h3>
                      <select value={leaveForm.staff_id} onChange={(e) => setLeaveForm({ ...leaveForm, staff_id: e.target.value })}>
                        <option value="">Select staff…</option>
                        {hr.staff.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.role}</option>)}
                      </select>
                      <div className="inv-item-row">
                        <select value={leaveForm.type} onChange={(e) => setLeaveForm({ ...leaveForm, type: e.target.value })}>
                          <option value="annual">Annual</option>
                          <option value="sick">Sick</option>
                          <option value="maternity">Maternity</option>
                          <option value="paternity">Paternity</option>
                          <option value="unpaid">Unpaid</option>
                        </select>
                      </div>
                      <div className="inv-item-row">
                        <input type="date" value={leaveForm.start_date} onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })} />
                        <input type="date" value={leaveForm.end_date} onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })} />
                      </div>
                      <div className="quick-actions">
                        <button className="btn-primary" onClick={async () => {
                          await api('/leaves', { method: 'POST', body: JSON.stringify(leaveForm) });
                          setHr(await api('/hr-dashboard'));
                          setLeaveForm(null);
                        }}>Request leave</button>
                        <button className="btn-ghost" onClick={() => setLeaveForm(null)}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {hrTab === 'staff' && hr.staff.map((s) => (
                    <div key={s.id} className="inv-row">
                      <div className={`thread-ava ava-c${s.id % 5}`}>{(s.name || '?')[0]}</div>
                      <div className="thread-info">
                        <b>{s.name} · {s.role}</b>
                        <span>{s.email} · {s.phone}</span>
                      </div>
                      <div className="inv-right">
                        <span className="chip closed">{s.department}</span>
                        <span className="chip draft">{s.onboarding}</span>
                        <div className="inv-amt">{fmt(s.salary)}/mo</div>
                        <button className="btn-ghost sm" onClick={() => setHrForm({ id: s.id, name: s.name, email: s.email || '', phone: s.phone || '', department: s.department, role: s.role, salary: s.salary, bank: s.bank || '', pension_rate: s.pension_rate, hmo_plan: s.hmo_plan || '', onboarding: s.onboarding, next_of_kin: s.next_of_kin || '', password: '' })}>✏️</button>
                      </div>
                    </div>
                  ))}

                  {hrTab === 'advances' && hr.advances.map((a) => (
                    <div key={a.id} className="inv-row">
                      <div className="thread-ava">💸</div>
                      <div className="thread-info">
                        <b>{a.name}</b>
                        <span>{a.reason} · {a.requested_at}</span>
                      </div>
                      <div className="inv-right">
                        <div className="inv-amt">{fmt(a.amount)}</div>
                        <span className={`chip ${a.status === 'pending' ? 'open' : a.status === 'approved' ? 'pending' : 'closed'}`}>{a.status}</span>
                        {a.status === 'pending' && <button className="btn-primary sm" onClick={async () => { await api(`/salary-advances/${a.id}`, { method: 'PUT', body: JSON.stringify({ status: 'approved' }) }); setHr(await api('/hr-dashboard')); }}>Approve</button>}
                        {a.status === 'approved' && <button className="btn-ghost sm" onClick={async () => { await api(`/salary-advances/${a.id}`, { method: 'PUT', body: JSON.stringify({ status: 'repaid' }) }); setHr(await api('/hr-dashboard')); }}>Mark repaid</button>}
                      </div>
                    </div>
                  ))}

                  {hrTab === 'leaves' && hr.leaves.map((l) => (
                    <div key={l.id} className="inv-row">
                      <div className="thread-ava">🏖</div>
                      <div className="thread-info">
                        <b>{l.name} — {l.type} leave</b>
                        <span>{l.start_date} → {l.end_date}</span>
                      </div>
                      <div className="inv-right">
                        <span className={`chip ${l.status === 'pending' ? 'open' : l.status === 'approved' ? 'closed' : 'low'}`}>{l.status}</span>
                        {l.status === 'pending' && (
                          <div className="quick-actions">
                            <button className="btn-primary sm" onClick={async () => { await api(`/leaves/${l.id}`, { method: 'PUT', body: JSON.stringify({ status: 'approved' }) }); setHr(await api('/hr-dashboard')); }}>✓</button>
                            <button className="btn-ghost sm" onClick={async () => { await api(`/leaves/${l.id}`, { method: 'PUT', body: JSON.stringify({ status: 'rejected' }) }); setHr(await api('/hr-dashboard')); }}>✕</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {hr.staff.length === 0 && <p className="muted">No staff yet — add your first team member.</p>}
                </div>
              </>
            )}

            {dept === 'account' && account && (
              <div className="card">
                <h3>👤 Account</h3>
                <div className="inv-line"><span>Business</span><span>{account.user.business_name || '—'}</span></div>
                <div className="inv-line"><span>Owner</span><span>{account.user.name}</span></div>
                <div className="inv-line"><span>Email</span><span>{account.user.email}</span></div>
                <div className="inv-line"><span>Plan</span><span className="chip closed">{account.plan}</span></div>
                <h3 style={{ marginTop: 14 }}>💰 Billing</h3>
                <div className="inv-line"><span>Conversion fees earned</span><span>{fmt(account.billing.fees_earned_ngn)}</span></div>
                <div className="inv-line"><span>Receivables outstanding</span><span>{fmt(account.billing.receivables_ngn)}</span></div>
                <div className="inv-line"><span>Paid invoices (all time)</span><span>{fmt(account.billing.paid_total_ngn)}</span></div>
                <div className="inv-line"><span>Foreign-currency invoices</span><span>{account.billing.foreign_invoices}</span></div>
                <h3 style={{ marginTop: 14 }}>🔌 Integrations</h3>
                <div className="inv-line">
                  <span>Paystack</span>
                  <span className={`chip ${account.integrations.paystack ? 'closed' : 'draft'}`}>{account.integrations.paystack ? 'live' : 'demo mode'}</span>
                </div>
                <div className="inv-line">
                  <span>WhatsApp Cloud API</span>
                  <span className={`chip ${account.integrations.whatsapp_cloud_api ? 'closed' : 'draft'}`}>{account.integrations.whatsapp_cloud_api ? 'connected' : 'not connected'}</span>
                </div>
                <div className="inv-line"><span>FX rates</span><span>{account.integrations.fx_source}</span></div>
                <div className="inv-line"><span>Conversion fee</span><span>{(account.integrations.currency_fee_rate * 100).toFixed(1)}% of foreign invoices</span></div>
                <h3 style={{ marginTop: 14 }}>⚙️ Feature access (who sees what)</h3>
                <p className="muted">Switch off any section and it disappears from every staff member's app instantly.</p>
                {[['customers', '👥 Customers'], ['inbox', '💬 WhatsApp Inbox'], ['invoices', '🧾 Invoicing'], ['followups', '📞 Follow-ups'], ['feedback', '📝 Feedback'], ['reports', '📊 Reports'], ['ads', '📣 Ads Studio'], ['hr', '🧑💼 HR'], ['pipeline', '🔁 Pipeline']].map(([k, label]) => (
                  <div key={k} className="inv-line">
                    <span>{label}</span>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={orgFeats ? orgFeats[k] !== false : true}
                        onChange={async (e) => {
                          const next = { ...(orgFeats || {}), [k]: e.target.checked };
                          setOrgFeats(next);
                          await api('/org/features', { method: 'PUT', body: JSON.stringify({ features: next }) });
                        }}
                      />
                      <span className="slider" />
                    </label>
                  </div>
                ))}
                {hr && (
                  <>
                    <h3 style={{ marginTop: 14 }}>👥 Staff & departments</h3>
                    <p className="muted">Assign staff to a department — they only see what that department can access.</p>
                    {hr.staff.map((s) => (
                      <div key={s.id} className="inv-line">
                        <span>{s.name}</span>
                        <select
                          value={s.department}
                          onChange={async (e) => {
                            await api(`/staff/${s.id}`, { method: 'PUT', body: JSON.stringify({ department: e.target.value }) });
                            setHr(await api('/hr-dashboard'));
                          }}
                        >
                          <option value="sales">Sales</option>
                          <option value="support">Support</option>
                          <option value="inventory">Inventory</option>
                          <option value="hr">HR</option>
                          <option value="account">Account</option>
                        </select>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </>
        )}

        {view === 'customers' && (custView === 'form' && custForm ? (
          <div className="card">
            <h3>{custForm.id ? '✏️ Edit customer' : '➕ Add customer'}</h3>
            <div className="inv-item-row">
              <input placeholder="Contact name" value={custForm.name} onChange={(e) => setCustForm({ ...custForm, name: e.target.value })} />
              <input placeholder="Company" value={custForm.company} onChange={(e) => setCustForm({ ...custForm, company: e.target.value })} />
            </div>
            <div className="inv-item-row">
              <input placeholder="Phone" value={custForm.phone} onChange={(e) => setCustForm({ ...custForm, phone: e.target.value })} />
              <input placeholder="Email" value={custForm.email} onChange={(e) => setCustForm({ ...custForm, email: e.target.value })} />
            </div>
            <div className="inv-item-row">
              <input placeholder="Tags (comma-separated)" value={custForm.tags} onChange={(e) => setCustForm({ ...custForm, tags: e.target.value })} />
              <select value={custForm.status} onChange={(e) => setCustForm({ ...custForm, status: e.target.value })}>
                <option value="lead">Lead</option>
                <option value="contacted">Contacted</option>
                <option value="qualified">Qualified</option>
                <option value="proposal_sent">Proposal sent</option>
                <option value="negotiation">Negotiation</option>
                <option value="won">Won</option>
                <option value="lost">Lost</option>
              </select>
            </div>
            <div className="inv-item-row">
              <input type="number" min="0" placeholder="Deal value ₦" value={custForm.deal_value_ngn} onChange={(e) => setCustForm({ ...custForm, deal_value_ngn: e.target.value })} />
              <input type="number" min="0" placeholder="Debt ₦" value={custForm.debt_ngn} onChange={(e) => setCustForm({ ...custForm, debt_ngn: e.target.value })} />
            </div>
            <div className="quick-actions">
              <button className="btn-primary" onClick={saveCustomer}>{custForm.id ? 'Save changes' : 'Add customer'}</button>
              <button className="btn-ghost" onClick={() => { setCustView('list'); setCustForm(null); }}>Cancel</button>
              {custForm.id && <button className="btn-ghost" style={{ color: '#c0392b' }} onClick={deleteCustomer}>🗑 Delete</button>}
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="inv-head"><h3>Customer Book ({contacts.length})</h3><button className="btn-primary sm" onClick={openNewCustomer}>+ Add customer</button></div>
            {contacts.map((c) => (
              <div key={c.id} className="inv-row">
                <div className="thread-ava">{(c.company || c.name || '?')[0]}</div>
                <div className="thread-info">
                  <b>{c.company || c.name}</b>
                  <span>{c.phone} · {c.status} · {c.tags}</span>
                </div>
                <div className="inv-right">
                  {c.deal_value_ngn > 0 && <div className="amt">{fmt(c.deal_value_ngn)}</div>}
                  {c.debt_ngn > 0 && <div className="debt">{fmt(c.debt_ngn)}</div>}
                  <button className="btn-ghost sm" onClick={() => openEditCustomer(c)}>✏️ Edit</button>
                </div>
              </div>
            ))}
          </div>
        ))}

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
                  <div key={i.id} className="inv-row" onClick={() => openInvoice(i)}>
                    <div className="thread-ava">🧾</div>
                    <div className="thread-info">
                      <b>{i.company || i.name}</b>
                      <span>{i.number} · due {i.due_date}{i.currency !== 'NGN' ? ` · ${i.currency}` : ''}</span>
                    </div>
                    <div className="inv-right">
                      <div className="inv-amt">{fmtCur(i.total + (i.fee || 0), i.currency)}</div>
                      {i.currency !== 'NGN' && <div className="muted inv-equiv">≈ {fmt(i.ngn_total)}</div>}
                      <span className={`chip ${i.status}`}>{i.status}</span>
                    </div>
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
                <label className="inv-label">Currency</label>
                <select value={newInv.currency} onChange={(e) => setNewInv({ ...newInv, currency: e.target.value })}>
                  <option value="NGN">₦ Naira (NGN)</option>
                  <option value="USD">$ US Dollar (USD)</option>
                  <option value="EUR">€ Euro (EUR)</option>
                  <option value="GBP">£ British Pound (GBP)</option>
                </select>
                {fx && newInv.currency !== 'NGN' && (
                  <p className="muted fx-hint">1 {newInv.currency} ≈ {fmt(fx.rates[newInv.currency])} · {fx.source === 'live' ? 'live rate' : 'offline rate'} — books stay in naira automatically</p>
                )}
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

            {invView === 'detail' && activeInv && (invEdit ? (
              <div>
                <h3>✏️ Edit draft invoice {activeInv.number}</h3>
                <label className="inv-label">Due date</label>
                <input type="date" value={invEdit.due_date} onChange={(e) => setInvEdit({ ...invEdit, due_date: e.target.value })} />
                <label className="inv-label">Currency</label>
                <select value={invEdit.currency} onChange={(e) => setInvEdit({ ...invEdit, currency: e.target.value })}>
                  <option value="NGN">₦ Naira (NGN)</option>
                  <option value="USD">$ US Dollar (USD)</option>
                  <option value="EUR">€ Euro (EUR)</option>
                  <option value="GBP">£ British Pound (GBP)</option>
                </select>
                <label className="inv-label">Items</label>
                {invEdit.items.map((it, idx) => (
                  <div key={idx} className="inv-item-row">
                    <input
                      placeholder="Description"
                      value={it.description}
                      onChange={(e) => {
                        const items = [...invEdit.items];
                        items[idx] = { ...it, description: e.target.value };
                        setInvEdit({ ...invEdit, items });
                      }}
                    />
                    <input
                      type="number" min="1" placeholder="Qty" style={{ width: 64 }}
                      value={it.qty}
                      onChange={(e) => {
                        const items = [...invEdit.items];
                        items[idx] = { ...it, qty: e.target.value };
                        setInvEdit({ ...invEdit, items });
                      }}
                    />
                    <input
                      type="number" min="0" placeholder="Unit" style={{ width: 100 }}
                      value={it.unit_price}
                      onChange={(e) => {
                        const items = [...invEdit.items];
                        items[idx] = { ...it, unit_price: e.target.value };
                        setInvEdit({ ...invEdit, items });
                      }}
                    />
                    <button className="btn-ghost sm" onClick={() => setInvEdit({ ...invEdit, items: invEdit.items.filter((_, j) => j !== idx) })}>✕</button>
                  </div>
                ))}
                <button className="btn-ghost sm" onClick={() => setInvEdit({ ...invEdit, items: [...invEdit.items, { description: '', qty: 1, unit_price: '' }] })}>+ Add item</button>
                <div className="quick-actions">
                  <button className="btn-primary" onClick={saveInvEdit}>Save changes (totals recomputed)</button>
                  <button className="btn-ghost" onClick={() => setInvEdit(null)}>Cancel</button>
                </div>
              </div>
            ) : (
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
                      <span>{fmtCur(it.amount, activeInv.currency)}</span>
                    </div>
                  ))}
                  <div className="inv-line muted"><span>Subtotal</span><span>{fmtCur(activeInv.subtotal, activeInv.currency)}</span></div>
                  <div className="inv-line muted"><span>VAT (7.5%)</span><span>{fmtCur(activeInv.tax, activeInv.currency)}</span></div>
                  {activeInv.fee > 0 && (
                    <div className="inv-line muted"><span>Processing fee ({(activeInv.fee_rate * 100).toFixed(1)}%)</span><span>{fmtCur(activeInv.fee, activeInv.currency)}</span></div>
                  )}
                  <div className="inv-line total"><span>Total</span><span>{fmtCur(activeInv.total + (activeInv.fee || 0), activeInv.currency)}</span></div>
                  {activeInv.currency !== 'NGN' && (
                    <div className="inv-line muted"><span>Naira equivalent @ {Number(activeInv.fx_rate).toLocaleString()}</span><span>{fmt(activeInv.ngn_total)}</span></div>
                  )}
                </div>
                <div className="inv-actions">
                  {activeInv.status === 'draft' && <button className="btn-primary act-primary" onClick={sendInvoice}>Mark as sent</button>}
                  {(activeInv.status === 'sent' || activeInv.status === 'overdue') && <button className="btn-primary act-primary" onClick={payInvoice}>Mark as paid ✓</button>}
                  <div className="inv-actions-grid">
                    {activeInv.status !== 'paid' && (
                      <>
                        <button className="act-btn" onClick={shareWhatsApp}><span>💬</span>WhatsApp</button>
                        <button className="act-btn" onClick={copyPayLink}><span>🔗</span>Copy link</button>
                      </>
                    )}
                    <button className="act-btn" onClick={downloadPdf}><span>⬇️</span>PDF</button>
                    <button className="act-btn" onClick={emailInvoice}><span>✉️</span>Email</button>
                    {activeInv.status === 'draft' && <button className="act-btn" onClick={() => openInvEdit(activeInv, invItems)}><span>✏️</span>Edit</button>}
                  </div>
                </div>
              </>
            ))}
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

        {view === 'feedback' && (
          <div className="card">
            <div className="inv-head"><h3>📝 Conversation Feedback</h3><button className="btn-primary sm" onClick={() => setFbOpen(!fbOpen)}>+ Add feedback</button></div>
            <p className="muted">Capture what customers said on calls and visits — the AI reports use it.</p>
            {fbOpen && (
              <>
                <label className="inv-label">Customer (optional)</label>
                <select value={fbForm.contact_id} onChange={(e) => setFbForm({ ...fbForm, contact_id: e.target.value })}>
                  <option value="">General</option>
                  {contacts.map((c) => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
                </select>
                <textarea
                  className="fb-area"
                  placeholder="e.g. Called GPFI procurement — they said management is reviewing the proposal this week…"
                  value={fbForm.body}
                  onChange={(e) => setFbForm({ ...fbForm, body: e.target.value })}
                />
                <div className="quick-actions">
                  <button className="btn-primary" onClick={saveFeedback}>Save feedback</button>
                </div>
              </>
            )}
            {feedback.length === 0 && !fbOpen && <p className="muted">No feedback captured yet.</p>}
            {feedback.map((f) => (
              <div key={f.id} className="followup">
                <b>{f.company || f.name || 'General'}</b>
                <p>{f.body}</p>
                <div className="quick-actions">
                  <button className="btn-ghost sm" onClick={() => deleteFeedback(f.id)}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {view === 'reports' && (
          <div className="card">
            <h3>📊 AI Activity Report</h3>
            <div className="dept-pills">
              {[['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly']].map(([k, label]) => (
                <button key={k} className={`pill ${reportPeriod === k ? 'active' : ''}`} onClick={() => { setReportPeriod(k); setReport(null); }}>
                  {label}
                </button>
              ))}
            </div>
            <button className="btn-primary" onClick={generateReport} disabled={reportLoading}>
              {reportLoading ? 'Compiling…' : `Generate ${reportPeriod} report`}
            </button>
            {report && (
              <div className="report">
                <p className="muted">Generated {new Date(report.generated_at).toLocaleString()} · covers last {report.period === 'daily' ? '1 day' : report.period === 'weekly' ? '7 days' : report.period === 'monthly' ? '30 days' : '90 days'}</p>
                {report.sections.map((s) => (
                  <div key={s.scope}>
                    <h3 style={{ marginTop: 14 }}>{s.title}</h3>
                    <ul className="ads-list">
                      {s.summary.map((line, i) => <li key={i}>{line}</li>)}
                    </ul>
                    <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Recent items:</div>
                    {s.rows.length === 0 && <p className="muted">None in this period.</p>}
                    {s.rows.slice(0, 10).map((r, i) => (
                      <div key={i} className="inv-line muted">
                        <span>{(r.body || '').slice(0, 64)}</span>
                        <span>{r.status || ''}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
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
        {nav.filter(([k]) => allowed(k)).map(([k, icon, label]) => (
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
  const [showPw, setShowPw] = useState(false);
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
          <div className="pw-wrap">
            <input type={showPw ? 'text' : 'password'} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button type="button" className="pw-toggle" onClick={() => setShowPw(!showPw)} aria-label="Toggle password visibility">
              {showPw ? '🙈' : '👁️'}
            </button>
          </div>
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
