import React, { useEffect, useState } from 'react';

const API = '/api';
const tokenKey = 'omnicrm_token';
// A demo-link tab must always boot clean: never carry an old session into guest mode.
if (typeof window !== 'undefined' && sessionStorage.getItem('omnicrm_demo') && localStorage.getItem(tokenKey)) {
  localStorage.removeItem(tokenKey);
}

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

const jwtPayload = () => {
  const t = localStorage.getItem(tokenKey);
  if (!t) return null;
  try { return JSON.parse(atob(t.split('.')[1])); } catch { return null; }
};
const meJwt = () => !!jwtPayload()?.staff_id;

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
  const [payrollRuns, setPayrollRuns] = useState([]);
  const [activeRun, setActiveRun] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [portal, setPortal] = useState(null);
  const [remit, setRemit] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [portalShifts, setPortalShifts] = useState([]);
  const [demoLinks, setDemoLinks] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [orderForm, setOrderForm] = useState(null);
  const [myContacts, setMyContacts] = useState([]);
  const [mailThreads, setMailThreads] = useState([]);
  const [mailThread, setMailThread] = useState(null);
  const [stockPosts, setStockPosts] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [mentionStaff, setMentionStaff] = useState([]);
  const [mentionGroups] = useState(['sales', 'support', 'inventory', 'hr', 'account']);
  const [mailDraft, setMailDraft] = useState('');
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionedIds, setMentionedIds] = useState([]);
  const [mentionedGroups, setMentionedGroups] = useState([]);
  const [invEdit, setInvEdit] = useState(null); // draft invoice edit state
  const [moreOpen, setMoreOpen] = useState(false); // mobile overflow menu
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
        try { setPayrollRuns((await api('/payroll/runs')).runs); } catch { /* non-HR */ }
        try { setAttendance((await api('/attendance')).attendance); } catch { /* non-HR */ }
        try { setRemit(await api('/remittances')); } catch { /* non-HR */ }
        try { setShifts((await api('/shifts')).shifts); } catch { /* non-HR */ }
        try { setDemoLinks((await api('/demo-links')).links); } catch { /* owner-only */ }
        try { setCommissions((await api('/commissions')).rows); } catch { /* n/a */ }
        try { setOrders((await api('/orders')).rows); } catch { /* n/a */ }
        try { setNotifs((await api('/notifications')).rows); } catch { /* n/a */ }
        try { setMyContacts((await api('/me/contacts')).rows); } catch { /* n/a */ }
        try { setMailThreads((await api('/mail/threads')).threads); } catch { /* n/a */ }
        try { setStockPosts((await api('/stock')).posts); } catch { /* n/a */ }
        try { setReceipts((await api('/receipts')).rows); } catch { /* n/a */ }
        try { setMentionStaff((await api('/staff/mentions')).staff); } catch { /* n/a */ }
        if (meJwt()) { try { setPortal(await api('/me/portal')); setPortalShifts((await api('/me/shifts')).shifts); } catch { /* n/a */ } }
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
    if (sessionStorage.getItem('omnicrm_demo') && email !== 'guest@omnicrm.ng') {
      throw new Error('This demo link is guest-only. Sign in with guest@omnicrm.ng / guest-demo — or open the app without the demo link to sign in as an admin.');
    }
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
    sales: ['dashboard', 'sales', 'customers', 'inbox', 'invoices', 'orders', 'mail', 'followups', 'feedback', 'reports', 'pipeline'],
    support: ['dashboard', 'support', 'inbox', 'mail', 'feedback', 'reports'],
    inventory: ['dashboard', 'inventory', 'product', 'mail', 'reports'],
    hr: ['dashboard', 'hr', 'mail', 'reports'],
    account: ['dashboard', 'invoices', 'orders', 'mail', 'reports'],
  };
  const allowed = (section) => {
    if (section === 'portal') return !!(me?.staff_id || me?.staff);
    if (orgFeats && orgFeats[section] === false) return false;
    if (!me || !me.dept) return true;
    return (FRONT_ACCESS[me.dept] || []).includes(section);
  };
  const isGuest = !!me?.guest; // read-only demo session — hide admin/mutating controls
  const opsMode = !me?.dept || me?.dept === 'account' || me?.dept === 'hr'; // can approve orders & post payments

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
    setCustForm({ id: null, name: '', company: '', phone: '', email: '', tags: 'lead', status: 'lead', deal_value_ngn: 0, debt_ngn: 0, staff_id: null });
    setCustView('form');
  };
  const openEditCustomer = (c) => {
    setCustForm({ id: c.id, name: c.name, company: c.company || '', phone: c.phone || '', email: c.email || '', tags: c.tags || '', status: c.status || 'lead', deal_value_ngn: c.deal_value_ngn || 0, debt_ngn: c.debt_ngn || 0, staff_id: c.staff_id || null });
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
    ['orders', '📦', 'Orders'],
    ['mail', '✉️', 'In-Mail'],
    ['followups', '📞', 'Follow-ups'],
    ['feedback', '📝', 'Feedback'],
    ['reports', '📊', 'Reports'],
    ['portal', '👤', 'My Portal'],
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
            <h1>Good morning{me?.name ? `, ${me.name.split(' ')[0]}` : ''} 👋{me?.dept ? <span className="dept-tag">{me.dept}</span> : null}{me?.guest ? <span className="dept-tag guest-tag">read-only</span> : null}</h1>
            <div className="dept-pills">
              {depts.filter(([k]) => allowed(k)).map(([k, label]) => (
                <button key={k} className={`pill ${dept === k ? 'active' : ''}`} onClick={() => setDept(k)}>{label}</button>
              ))}
            </div>
            <div className="notif-bar">
              <button className="pill notif-pill" onClick={() => setNotifOpen(!notifOpen)}>
                🔔 Notifications{notifs.filter((n) => !n.read).length > 0 && <b className="notif-badge">{notifs.filter((n) => !n.read).length}</b>}
              </button>
              {notifOpen && (
                <div className="notif-panel">
                  <div className="inv-head" style={{ marginBottom: 6 }}>
                    <b>Notifications</b>
                    <button className="btn-ghost sm" onClick={async () => { await api('/notifications/read', { method: 'POST' }); setNotifs((await api('/notifications')).rows); }}>Mark all read</button>
                  </div>
                  {notifs.map((n) => (
                    <div key={n.id} className="notif-line" style={{ opacity: n.read ? 0.55 : 1 }}>
                      <span>{n.kind === 'payment_received' ? '💰' : n.kind === 'order_delivered' ? '🚚' : n.kind === 'order_approved' ? '✅' : n.kind === 'order_rejected' ? '✕' : '📦'}</span>
                      <span style={{ fontSize: 13 }}>{n.message}</span>
                    </div>
                  ))}
                  {notifs.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Nothing yet — order updates will land here.</p>}
                </div>
              )}
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
                <div className="kpis">
                  <div className="kpi"><div className="label">My orders (this month)</div><div className="value">{orders.filter((o) => (o.created_at || '').slice(0, 7) === new Date().toISOString().slice(0, 7)).length}</div></div>
                  <div className="kpi"><div className="label">Orders delivered</div><div className="value">{orders.filter((o) => ['delivered', 'paid'].includes(o.status)).length}</div></div>
                  <div className="kpi"><div className="label">Payments received</div><div className="value">{fmt(orders.filter((o) => o.status === 'paid').reduce((s, o) => s + o.total_ngn, 0))}</div></div>
                  <div className="kpi"><div className="label">Awaiting approval</div><div className="value">{orders.filter((o) => o.status === 'pending').length}</div></div>
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
                      {[['staff', `Staff (${hr.staff.length})`], ['advances', `Advances (${hr.advances.length})`], ['leaves', `Leave (${hr.leaves.length})`], ['commissions', 'Commissions'], ['payroll', 'Payroll'], ['attendance', 'Attendance'], ['remit', 'Statutory'], ['roster', 'Roster']].map(([k, label]) => (
                        <button key={k} className={`pill ${hrTab === k ? 'active' : ''}`} onClick={() => setHrTab(k)}>{label}</button>
                      ))}
                    </div>
                    {!isGuest && hrTab === 'staff' && <button className="btn-primary sm" onClick={() => setHrForm({ id: null, name: '', email: '', phone: '', department: 'sales', role: '', salary: 0, bank: '', pension_rate: 8, hmo_plan: '', onboarding: 'invited', next_of_kin: '', password: '' })}>+ Add staff</button>}
                    {!isGuest && hrTab === 'advances' && <button className="btn-primary sm" onClick={() => setAdvForm({ staff_id: '', amount: '', reason: '' })}>+ New advance</button>}
                    {!isGuest && hrTab === 'leaves' && <button className="btn-primary sm" onClick={() => setLeaveForm({ staff_id: '', type: 'annual', start_date: '', end_date: '' })}>+ New leave</button>}
                    {!isGuest && hrTab === 'payroll' && <button className="btn-primary sm" onClick={async () => {
                      const period = new Date().toISOString().slice(0, 7);
                      await api('/payroll/runs', { method: 'POST', body: JSON.stringify({ period }) });
                      setPayrollRuns((await api('/payroll/runs')).runs);
                    }}>Run payroll (this month)</button>}
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

                  {hrTab === 'commissions' && (
                    <>
                      <p className="muted">Commission = paid invoice value from each rep's customer accounts × their rate. Flows into payroll runs and payslips automatically.</p>
                      {commissions.map((c) => (
                        <div key={c.staff_id} className="inv-row">
                          <div className={`thread-ava ava-c${c.staff_id % 5}`}>{(c.name || '?')[0]}</div>
                          <div className="thread-info">
                            <b>{c.name} · {c.department}</b>
                            <span>rate</span>
                          </div>
                          <div className="inv-right">
                            <div className="inv-amt">{fmt(c.period.commission)}<span className="muted" style={{ fontSize: 10, fontWeight: 500 }}> this month</span></div>
                            <span className="muted" style={{ fontSize: 11 }}>{c.period.paid_invoices} paid inv · {fmt(c.period.sales_value)} · all-time {fmt(c.all_time.commission)}</span>
                            <div className="quick-actions" style={{ marginTop: 0 }}>
                              <input
                                type="number" min="0" step="0.5"
                                style={{ width: 74, padding: '5px 8px' }}
                                value={c.rate}
                                onChange={async (e) => {
                                  await api(`/staff/${c.staff_id}`, { method: 'PUT', body: JSON.stringify({ commission_rate: Number(e.target.value) }) });
                                  setCommissions((await api('/commissions')).rows);
                                }}
                              />%
                            </div>
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  {hrTab === 'payroll' && (
                    <>
                      {activeRun ? (
                        <>
                          <div className="convo-head" style={{ marginTop: 10 }}>
                            <button className="btn-ghost" onClick={() => setActiveRun(null)}>←</button>
                            <div><b>{activeRun.run.period} payroll</b><span className="muted">{activeRun.run.status}</span></div>
                            <span className={`chip ${activeRun.run.status === 'paid' ? 'closed' : activeRun.run.status === 'approved' ? 'pending' : 'draft'}`}>{activeRun.run.status}</span>
                          </div>
                          <div className="kpis">
                            <div className="kpi"><div className="label">Gross</div><div className="value">{fmt(activeRun.run.total_gross)}</div></div>
                            <div className="kpi"><div className="label">Pension</div><div className="value">{fmt(activeRun.run.total_pension)}</div></div>
                            <div className="kpi"><div className="label">PAYE</div><div className="value">{fmt(activeRun.run.total_paye)}</div></div>
                            <div className="kpi"><div className="label">Net</div><div className="value">{fmt(activeRun.run.total_net)}</div></div>
                          </div>
                          {activeRun.payslips.map((p) => (
                            <div key={p.id} className="inv-row">
                              <div className="thread-ava">🧾</div>
                              <div className="thread-info">
                                <b>{p.name} · {p.role}</b>
                                <span>{p.department} · net {fmt(p.net)}</span>
                              </div>
                              <div className="inv-right">
                                <span className="muted" style={{ fontSize: 11 }}>gross {fmt(p.gross)}{p.commission > 0 ? ` + comm ${fmt(p.commission)}` : ''}</span>
                                <span className="muted" style={{ fontSize: 11 }}>pension −{fmt(p.pension)} · PAYE −{fmt(p.paye)}</span>
                                <button className="btn-ghost sm" onClick={async () => {
                                  const res = await fetch(`${API}/payslips/${p.id}/pdf`, { headers: { Authorization: `Bearer ${localStorage.getItem(tokenKey)}` } });
                                  const blob = await res.blob();
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url; a.download = `Payslip-${p.name}.pdf`;
                                  document.body.appendChild(a); a.click(); a.remove();
                                  URL.revokeObjectURL(url);
                                }}>⬇ PDF</button>
                              </div>
                            </div>
                          ))}
                          <div className="quick-actions">
                            {activeRun.run.status === 'draft' && <button className="btn-primary" onClick={async () => { const d = await api(`/payroll/runs/${activeRun.run.id}`, { method: 'PUT', body: JSON.stringify({ status: 'approved' }) }); setActiveRun({ ...activeRun, run: d.run }); setPayrollRuns((await api('/payroll/runs')).runs); }}>Approve payroll</button>}
                            {activeRun.run.status === 'approved' && <button className="btn-primary" onClick={async () => { const d = await api(`/payroll/runs/${activeRun.run.id}`, { method: 'PUT', body: JSON.stringify({ status: 'paid' }) }); setActiveRun({ ...activeRun, run: d.run }); setPayrollRuns((await api('/payroll/runs')).runs); setRemit(await api('/remittances')); }}>Mark as paid ✓</button>}
                            <button className="btn-ghost" onClick={async () => {
                              const res = await fetch(`${API}/payroll/runs/${activeRun.run.id}/journal.csv`, { headers: { Authorization: `Bearer ${localStorage.getItem(tokenKey)}` } });
                              const blob = await res.blob();
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url; a.download = `payroll-journal-${activeRun.run.period}.csv`;
                              document.body.appendChild(a); a.click(); a.remove();
                              URL.revokeObjectURL(url);
                            }}>⬇ Journal CSV (accountant)</button>
                          </div>
                        </>
                      ) : (
                        <>
                          {payrollRuns.length === 0 && <p className="muted">No payroll runs yet — run this month's payroll to generate payslips.</p>}
                          {payrollRuns.map((r) => (
                            <div key={r.id} className="inv-row" onClick={async () => setActiveRun(await api(`/payroll/runs/${r.id}`))}>
                              <div className="thread-ava">💰</div>
                              <div className="thread-info">
                                <b>{r.period} payroll run</b>
                                <span>net {fmt(r.total_net)} · created {r.created_at.slice(0, 10)}</span>
                              </div>
                              <div className="inv-right">
                                <span className={`chip ${r.status === 'paid' ? 'closed' : r.status === 'approved' ? 'pending' : 'draft'}`}>{r.status}</span>
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </>
                  )}

                  {hrTab === 'attendance' && (
                    <>
                      <p className="muted">Today's attendance — staff clock in from their portal or you can do it for them.</p>
                      {hr.staff.map((s) => {
                        const row = attendance.find((a) => a.staff_id === s.id);
                        return (
                          <div key={s.id} className="inv-row">
                            <div className={`thread-ava ava-c${s.id % 5}`}>{(s.name || '?')[0]}</div>
                            <div className="thread-info">
                              <b>{s.name}</b>
                              <span>{row?.clock_in ? `In: ${row.clock_in}${row?.clock_out ? ` · Out: ${row.clock_out}` : ''}` : 'Not clocked in'}</span>
                            </div>
                            <div className="inv-right">
                              {!row?.clock_in ? (
                                <button className="btn-primary sm" onClick={async () => { await api('/attendance/clock-in', { method: 'POST', body: JSON.stringify({ staff_id: s.id }) }); setAttendance((await api('/attendance')).attendance); }}>Clock in</button>
                              ) : !row.clock_out ? (
                                <button className="btn-ghost sm" onClick={async () => { await api('/attendance/clock-out', { method: 'POST', body: JSON.stringify({ staff_id: s.id }) }); setAttendance((await api('/attendance')).attendance); }}>Clock out</button>
                              ) : (
                                <span className="chip closed">done</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                  {hrTab === 'remit' && remit && (
                    <>
                      <div className="kpis">
                        <div className="kpi"><div className="label">Pending obligations</div><div className="value">{remit.pending_count}</div></div>
                        <div className="kpi"><div className="label">Pending total</div><div className="value">{fmt(remit.pending_total)}</div></div>
                        <div className="kpi"><div className="label">Next due</div><div className="value" style={{ fontSize: 16 }}>{remit.next_due ? `${remit.next_due.type.toUpperCase()} · ${remit.next_due.due_date}` : '—'}</div></div>
                      </div>
                      <p className="muted">Filing calendar: PAYE due by the 10th of the following month · pension (staff 8% + employer 10%) due ~7 days after salary payment.</p>
                      {remit.remittances.map((r) => (
                        <div key={r.id} className="inv-row">
                          <div className="thread-ava">{r.type === 'paye' ? '🏛' : '🛡'}</div>
                          <div className="thread-info">
                            <b>{r.type.toUpperCase()} — {r.period}</b>
                            <span>due {r.due_date}{r.due_date < new Date().toISOString().slice(0, 10) && r.status === 'pending' ? ' · OVERDUE' : ''}</span>
                          </div>
                          <div className="inv-right">
                            <div className="inv-amt">{fmt(r.amount)}</div>
                            {r.status === 'pending' ? (
                              <button className="btn-primary sm" onClick={async () => { await api(`/remittances/${r.id}`, { method: 'PUT', body: JSON.stringify({ status: 'paid' }) }); setRemit(await api('/remittances')); }}>Mark paid</button>
                            ) : (
                              <span className="chip closed">paid</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  {hrTab === 'roster' && (
                    <>
                      <p className="muted">Next 7 days — pick each staff member's shift.</p>
                      {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                        const date = new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
                        const label = new Date(Date.now() + d * 864e5).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
                        return (
                          <div key={date} className="roster-day">
                            <b className="roster-date">{label}</b>
                            {hr.staff.map((s) => {
                              const row = shifts.find((sh) => sh.staff_id === s.id && sh.date === date);
                              return (
                                <div key={s.id} className="roster-row">
                                  <span>{s.name.split(' ')[0]}</span>
                                  <select
                                    value={row?.shift || 'morning'}
                                    onChange={async (e) => {
                                      await api('/shifts', { method: 'PUT', body: JSON.stringify({ staff_id: s.id, date, shift: e.target.value }) });
                                      setShifts((await api('/shifts')).shifts);
                                    }}
                                  >
                                    <option value="morning">🌅 Morning</option>
                                    <option value="afternoon">🌤 Afternoon</option>
                                    <option value="night">🌙 Night</option>
                                    <option value="off">😴 Off</option>
                                  </select>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </>
                  )}
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
                {isGuest ? (
                  <p className="muted">Feature access is managed by the organization owner — not available in guest mode.</p>
                ) : (
                  <>
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
                {!isGuest && (
                  <>
                <h3 style={{ marginTop: 14 }}>🔗 Demo links (shareable, revocable)</h3>
                <p className="muted">Create a link to share with anyone. Revoke it and it instantly stops working for them.</p>
                <button className="btn-primary sm" onClick={async () => {
                  const label = prompt('Label for this link? (e.g. "Investor pitch", "Kunle — Tue demo")') || '';
                  const d = await api('/demo-links', { method: 'POST', body: JSON.stringify({ label }) });
                  setDemoLinks((await api('/demo-links')).links);
                  const full = `${location.origin}${d.url}`;
                  navigator.clipboard.writeText(full);
                  alert(`Demo link created and copied:\n${full}\n\nTell me "break <label>" any time to revoke it.`);
                }}>+ Create demo link</button>
                {demoLinks.length === 0 && <p className="muted" style={{ marginTop: 8 }}>No demo links yet.</p>}
                {demoLinks.map((l) => (
                  <div key={l.id} className="inv-line" style={{ marginTop: 6 }}>
                    <span>{l.label || l.token}{l.active ? '' : ' (revoked)'} <span className="muted" style={{ fontSize: 11 }}>{l.token}</span></span>
                    <span className="quick-actions" style={{ marginTop: 0 }}>
                      {l.active ? (
                        <>
                          <button className="btn-ghost sm" onClick={() => { navigator.clipboard.writeText(`${location.origin}/demo.html?token=${l.token}`); alert('Link copied.'); }}>Copy</button>
                          <button className="btn-ghost sm" style={{ color: '#c0392b' }} onClick={async () => {
                            if (!window.confirm(`Revoke this link? Anyone holding it loses access instantly.`)) return;
                            await api(`/demo-links/${l.id}`, { method: 'DELETE' });
                            setDemoLinks((await api('/demo-links')).links);
                          }}>Revoke</button>
                        </>
                      ) : (
                        <span className="chip low">revoked</span>
                      )}
                    </span>
                  </div>
                ))}
                  </>
                )}
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
              <select value={custForm.staff_id || ''} onChange={(e) => setCustForm({ ...custForm, staff_id: e.target.value || null })}>
                <option value="">Sales rep: unassigned</option>
                {(hr?.staff || []).filter((s) => s.department === 'sales').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
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
            <div className="inv-head"><h3>Customer Book ({contacts.length})</h3>{!isGuest && <button className="btn-primary sm" onClick={openNewCustomer}>+ Add customer</button>}</div>
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
                  {!isGuest && <button className="btn-ghost sm" onClick={getDraft}>✦ AI Draft</button>}
                  <input
                    placeholder={isGuest ? 'Read-only guest mode — sending is disabled' : 'Type a message…'}
                    value={composer}
                    onChange={(e) => setComposer(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') sendMsg(); }}
                    disabled={isGuest}
                  />
                  {!isGuest && <button className="btn-primary sm" onClick={sendMsg}>Send</button>}
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'orders' && (
          <div className="card">
            <div className="inv-head">
              <h3>📦 Orders{opsMode ? '' : ' — yours'}</h3>
              {!isGuest && <button className="btn-primary sm" onClick={() => setOrderForm({ contact_id: '', items: [{ name: '', qty: 1, price: 0 }], note: '' })}>+ Raise order</button>}
            </div>
            {orderForm && (
              <div className="card" style={{ background: '#f7faf8' }}>
                <h3 style={{ marginTop: 0 }}>New order</h3>
                <div className="inv-item-row">
                  <select value={orderForm.contact_id} onChange={(e) => setOrderForm({ ...orderForm, contact_id: e.target.value })}>
                    <option value="">Select customer…</option>
                    {(opsMode ? contacts : myContacts).map((c) => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
                  </select>
                </div>
                {orderForm.items.map((it, i) => (
                  <div key={i} className="inv-item-row">
                    <input placeholder="Item name" value={it.name} onChange={(e) => setOrderForm({ ...orderForm, items: orderForm.items.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} />
                    <input type="number" min="1" placeholder="Qty" style={{ width: 84 }} value={it.qty} onChange={(e) => setOrderForm({ ...orderForm, items: orderForm.items.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x) })} />
                    <input type="number" min="0" placeholder="Unit price ₦" style={{ width: 130 }} value={it.price} onChange={(e) => setOrderForm({ ...orderForm, items: orderForm.items.map((x, j) => j === i ? { ...x, price: Number(e.target.value) } : x) })} />
                    <button className="act-btn" onClick={() => setOrderForm({ ...orderForm, items: orderForm.items.filter((_, j) => j !== i) })}>✕</button>
                  </div>
                ))}
                <button className="btn-ghost sm" onClick={() => setOrderForm({ ...orderForm, items: [...orderForm.items, { name: '', qty: 1, price: 0 }] })}>+ line</button>
                <div className="inv-item-row">
                  <button className="btn-primary sm" onClick={async () => {
                    try {
                      await api('/orders', { method: 'POST', body: JSON.stringify({ contact_id: Number(orderForm.contact_id), items: orderForm.items.filter((x) => x.name && x.price > 0), note: orderForm.note }) });
                      setOrderForm(null);
                      setOrders((await api('/orders')).rows);
                      setNotifs((await api('/notifications')).rows);
                    } catch (e) { alert(e.message); }
                  }}>Submit order</button>
                  <button className="btn-ghost sm" onClick={() => setOrderForm(null)}>Cancel</button>
                </div>
              </div>
            )}
            {orders.map((o) => (
              <div key={o.id} className="inv-row">
                <div className="thread-ava">{'📦'}</div>
                <div style={{ flex: 1 }}>
                  <div><b>Order #{o.id}</b> — {o.contact_name} {o.rep_name && <span className="muted">(rep: {o.rep_name})</span>}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {o.total_ngn.toLocaleString()} naira · {JSON.parse(o.items_json || '[]').map((x) => `${x.name} ×${x.qty}`).join(', ') || '—'}
                    {o.invoice_id && <> · <b>Invoice #{o.invoice_id}</b></>}
                    {o.payment_ref && <> · ref {o.payment_ref}</>}
                  </div>
                </div>
                <span className={`inv-tag ${o.status}`}>{o.status}</span>
                {opsMode && (
                  <div className="inv-actions-grid" style={{ marginTop: 0 }}>
                    {o.status === 'pending' && <button className="act-btn" onClick={async () => { await api(`/orders/${o.id}/approve`, { method: 'POST' }); setOrders((await api('/orders')).rows); setNotifs((await api('/notifications')).rows); }}><span>✅</span>Approve</button>}
                    {o.status === 'pending' && <button className="act-btn" onClick={async () => { await api(`/orders/${o.id}/reject`, { method: 'POST' }); setOrders((await api('/orders')).rows); }}><span>✕</span>Reject</button>}
                    {o.status === 'approved' && <button className="act-btn" onClick={async () => { await api(`/orders/${o.id}/deliver`, { method: 'POST' }); setOrders((await api('/orders')).rows); setNotifs((await api('/notifications')).rows); }}><span>🚚</span>Delivered</button>}
                    {o.status === 'delivered' && <button className="act-btn" onClick={async () => { const ref = prompt('Payment reference (optional)') || null; await api(`/orders/${o.id}/payment`, { method: 'POST', body: JSON.stringify({ ref }) }); setOrders((await api('/orders')).rows); setNotifs((await api('/notifications')).rows); }}><span>💰</span>Post payment</button>}
                  </div>
                )}
              </div>
            ))}
            {orders.length === 0 && <p className="muted">No orders yet — raise one above and watch it move through approval → invoice → delivery → payment.</p>}
          </div>
        )}

        {view === 'mail' && (
          <div className="card">
            <div className="inv-head">
              <h3>✉️ In-Mail — team communication</h3>
              {!mailThread && <button className="btn-primary sm" onClick={async () => {
                const subject = prompt('Thread subject (e.g. "Order for Eko — stock check")');
                if (!subject) return;
                await api('/mail/threads', { method: 'POST', body: JSON.stringify({ subject, kind: 'note' }) });
                setMailThreads((await api('/mail/threads')).threads);
              }}>+ New thread</button>}
              {mailThread && <button className="btn-ghost sm" onClick={() => setMailThread(null)}>← Back</button>}
            </div>
            {!mailThread ? (
              <>
                <div className="mail-sections">
                  <div className="mail-col">
                    <h4 style={{ marginTop: 0 }}>📮 Threads</h4>
                    {mailThreads.map((t) => (
                      <div key={t.id} className="inv-row" style={{ cursor: 'pointer' }} onClick={async () => setMailThread(await api(`/mail/threads/${t.id}`))}>
                        <div className="thread-ava">{t.kind === 'order' ? '📦' : t.kind === 'payment' ? '💰' : '✉️'}</div>
                        <div style={{ flex: 1 }}>
                          <b>{t.subject || '(no subject)'}</b>
                          <div className="muted" style={{ fontSize: 12 }}>{t.created_at}</div>
                        </div>
                      </div>
                    ))}
                    {mailThreads.length === 0 && <p className="muted">No threads yet — start one to talk to your team here instead of WhatsApp.</p>}
                  </div>
                  <div className="mail-col">
                    <h4 style={{ marginTop: 0 }}>📊 Latest stock (from inventory)</h4>
                    {stockPosts.map((p) => (
                      <div key={p.id} className="inv-row">
                        <div className="thread-ava">📦</div>
                        <div style={{ flex: 1 }}>
                          <b>{p.product_name}</b> — <b>{p.qty_on_hand}</b> on hand
                          {p.poster && <span className="muted"> · {p.poster}</span>}
                          {p.note && <div className="muted" style={{ fontSize: 12 }}>{p.note}</div>}
                        </div>
                      </div>
                    ))}
                    {stockPosts.length === 0 && <p className="muted">No stock posts yet.</p>}
                    {opsMode && <button className="btn-ghost sm" onClick={async () => {
                      const name = prompt('Product name');
                      if (!name) return;
                      const qty = Number(prompt('Quantity on hand'));
                      const note = prompt('Note (optional)') || '';
                      await api('/stock', { method: 'POST', body: JSON.stringify({ product_name: name, qty_on_hand: qty, note }) });
                      setStockPosts((await api('/stock')).posts);
                    }}>+ Post stock update</button>}
                  </div>
                  <div className="mail-col">
                    <h4 style={{ marginTop: 0 }}>🧾 Payment receipts</h4>
                    {receipts.map((r) => (
                      <div key={r.id} className="inv-row">
                        <div className="thread-ava">💰</div>
                        <div style={{ flex: 1 }}>
                          <b>{r.payer_name}</b> {r.amount_ngn && <span className="muted">· {fmt(r.amount_ngn)}</span>}
                          <div className="muted" style={{ fontSize: 12 }}>{r.contact_name}{r.rep_name && <> · rep: {r.rep_name}</>}</div>
                        </div>
                        <span className={`inv-tag ${r.status === 'matched' ? 'paid' : 'pending'}`}>{r.status}</span>
                        {opsMode && r.status === 'pending' && <button className="act-btn" onClick={async () => {
                          const inv = prompt('Match to invoice # (optional — enter number)');
                          await api(`/receipts/${r.id}/match`, { method: 'POST', body: JSON.stringify({ invoice_id: inv ? Number(inv) : null }) });
                          setReceipts((await api('/receipts')).rows);
                        }}><span>✅</span>Match</button>}
                      </div>
                    ))}
                    {receipts.length === 0 && <p className="muted">No receipts yet.</p>}
                    {!isGuest && <button className="btn-ghost sm" onClick={async () => {
                      const contactId = Number(prompt('Customer ID (see Customers tab)'));
                      if (!contactId) return;
                      const payer = prompt('Who paid? (e.g. "Alhaja Tuku — Alhaja Enterprises")');
                      if (!payer) return;
                      const amt = Number(prompt('Amount (₦)') || 0);
                      await api('/receipts', { method: 'POST', body: JSON.stringify({ contact_id: contactId, payer_name: payer, amount_ngn: amt }) });
                      setReceipts((await api('/receipts')).rows);
                    }}>+ Upload receipt</button>}
                  </div>
                </div>
              </>
            ) : (
              <div className="mail-thread">
                <h4>{mailThread.thread.subject || '(no subject)'}</h4>
                {mailThread.messages.map((m) => (
                  <div key={m.id} className="mail-msg" style={{ alignSelf: m.sender_staff_id === jwtPayload()?.staff_id ? 'flex-end' : 'flex-start' }}>
                    <div className="muted" style={{ fontSize: 11 }}>{m.sender_name || 'You'} {m.mentions?.length > 0 && <span>· mentioned {m.mentions.length}</span>}</div>
                    <div>{m.body}</div>
                  </div>
                ))}
                {mailThread.messages.length === 0 && <p className="muted">No messages yet.</p>}
                <div className="composer" style={{ marginTop: 12 }}>
                  <div style={{ position: 'relative' }}>
                    <input
                      placeholder="Type a message… type @ to mention a person or a team"
                      value={mailDraft}
                      onChange={(e) => { setMailDraft(e.target.value); setMentionOpen(e.target.value.endsWith('@')); }}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter' && mailDraft.trim() && !mentionOpen) {
                          const body = mailDraft.replace(/@$/, '').trim();
                          await api(`/mail/threads/${mailThread.thread.id}/messages`, { method: 'POST', body: JSON.stringify({ body, mentions: mentionedIds, groups: mentionedGroups }) });
                          setMailDraft(''); setMentionedIds([]); setMentionedGroups([]);
                          setMailThread(await api(`/mail/threads/${mailThread.thread.id}`));
                        }
                      }}
                    />
                    {mentionOpen && (
                      <div className="mention-pop">
                        <div className="mention-head">Tap to mention</div>
                        {mentionGroups.map((g) => (
                          <div key={g} className="mention-item" onClick={() => { setMentionedGroups([...new Set([...mentionedGroups, g])]); setMentionOpen(false); setMailDraft((d) => d.replace(/@$/, '') + '@' + g + ' '); }}>
                            👥 @{g} (whole team)
                          </div>
                        ))}
                        {mentionStaff.map((s) => (
                          <div key={s.id} className="mention-item" onClick={() => { setMentionedIds([...new Set([...mentionedIds, s.id])]); setMentionOpen(false); setMailDraft((d) => d.replace(/@$/, '') + '@' + s.name.split(' ')[0] + ' '); }}>
                            {s.name} <span className="muted">· {s.department}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {(mentionedIds.length > 0 || mentionedGroups.length > 0) && (
                    <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                      Tagging: {mentionGroups.map((g) => '#' + g).join(' ')} {mentionedIds.map((id) => { const s = mentionStaff.find((x) => x.id === id); return s ? '@' + s.name.split(' ')[0] : ''; }).join(' ')}
                    </div>
                  )}
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
                  {!isGuest && <button className="btn-primary sm" onClick={newInvoice}>+ New Invoice</button>}
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
                  {!isGuest && activeInv.status === 'draft' && <button className="btn-primary act-primary" onClick={sendInvoice}>Mark as sent</button>}
                  {!isGuest && (activeInv.status === 'sent' || activeInv.status === 'overdue') && <button className="btn-primary act-primary" onClick={payInvoice}>Mark as paid ✓</button>}
                  <div className="inv-actions-grid">
                    {!isGuest && activeInv.status !== 'paid' && (
                      <>
                        <button className="act-btn" onClick={shareWhatsApp}><span>💬</span>WhatsApp</button>
                        <button className="act-btn" onClick={copyPayLink}><span>🔗</span>Copy link</button>
                      </>
                    )}
                    <button className="act-btn" onClick={downloadPdf}><span>⬇️</span>PDF</button>
                    <button className="act-btn" onClick={emailInvoice}><span>✉️</span>Email</button>
                    {!isGuest && activeInv.status === 'draft' && <button className="act-btn" onClick={() => openInvEdit(activeInv, invItems)}><span>✏️</span>Edit</button>}
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
            <div className="inv-head"><h3>📝 Conversation Feedback</h3>{!isGuest && <button className="btn-primary sm" onClick={() => setFbOpen(!fbOpen)}>+ Add feedback</button>}</div>
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

        {view === 'portal' && portal && (
          <div className="card">
            <h3>👤 My Portal — {portal.staff.name}</h3>
            <div className="inv-line"><span>Role</span><span>{portal.staff.role} · {portal.staff.department}</span></div>
            <div className="inv-line"><span>Salary</span><span>{fmt(portal.staff.salary)}/mo</span></div>
            <div className="inv-line"><span>HMO</span><span>{portal.staff.hmo_plan || '—'}</span></div>
            <div className="inv-line"><span>Bank</span><span>{portal.staff.bank || '—'}</span></div>

            <h3 style={{ marginTop: 14 }}>⏰ Attendance today</h3>
            {portal.today_attendance[0]?.clock_in ? (
              <div className="inv-line">
                <span>Clocked in {portal.today_attendance[0].clock_in}</span>
                <span>{portal.today_attendance[0].clock_out ? `out ${portal.today_attendance[0].clock_out}` : 'still in'}</span>
              </div>
            ) : <p className="muted">Not clocked in yet.</p>}
            <div className="quick-actions">
              {!portal.today_attendance[0]?.clock_in ? (
                <button className="btn-primary" onClick={async () => { await api('/attendance/clock-in', { method: 'POST', body: '{}' }); setPortal(await api('/me/portal')); }}>⏰ Clock in</button>
              ) : !portal.today_attendance[0].clock_out ? (
                <button className="btn-primary" onClick={async () => { await api('/attendance/clock-out', { method: 'POST', body: '{}' }); setPortal(await api('/me/portal')); }}>🏁 Clock out</button>
              ) : null}
            </div>

            <h3 style={{ marginTop: 14 }}>🧾 My payslips</h3>
            {portal.payslips.length === 0 && <p className="muted">No payslips yet.</p>}
            {portal.payslips.map((p) => (
              <div key={p.id} className="inv-row">
                <div className="thread-ava">🧾</div>
                <div className="thread-info">
                  <b>{p.period} payslip</b>
                  <span>gross {fmt(p.gross)}{p.commission > 0 ? ` + commission ${fmt(p.commission)}` : ''} · pension −{fmt(p.pension)} · PAYE −{fmt(p.paye)}</span>
                </div>
                <div className="inv-right">
                  <div className="inv-amt">{fmt(p.net)}</div>
                  <button className="btn-ghost sm" onClick={async () => {
                    const res = await fetch(`${API}/payslips/${p.id}/pdf`, { headers: { Authorization: `Bearer ${localStorage.getItem(tokenKey)}` } });
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = `Payslip-${p.period}.pdf`;
                    document.body.appendChild(a); a.click(); a.remove();
                    URL.revokeObjectURL(url);
                  }}>⬇ PDF</button>
                </div>
              </div>
            ))}

            <h3 style={{ marginTop: 14 }}>💸 My salary advances</h3>
            {portal.advances.length === 0 && <p className="muted">No advances requested.</p>}
            {portal.advances.map((a) => (
              <div key={a.id} className="inv-line">
                <span>{fmt(a.amount)} — {a.reason}</span>
                <span className={`chip ${a.status === 'pending' ? 'open' : a.status === 'approved' ? 'pending' : 'closed'}`}>{a.status}</span>
              </div>
            ))}
            <div className="quick-actions">
              <button className="btn-primary sm" onClick={async () => {
                const amount = prompt('Advance amount (₦):');
                if (!amount) return;
                const reason = prompt('Reason (optional):') || '';
                await api('/me/advances', { method: 'POST', body: JSON.stringify({ amount: Number(amount), reason }) });
                setPortal(await api('/me/portal'));
              }}>Request advance</button>
            </div>

            <h3 style={{ marginTop: 14 }}>🏖 My leave</h3>
            {portal.leaves.length === 0 && <p className="muted">No leave requested.</p>}
            {portal.leaves.map((l) => (
              <div key={l.id} className="inv-line">
                <span>{l.type} · {l.start_date} → {l.end_date}</span>
                <span className={`chip ${l.status === 'pending' ? 'open' : l.status === 'approved' ? 'closed' : 'low'}`}>{l.status}</span>
              </div>
            ))}
            <div className="quick-actions">
              <button className="btn-primary sm" onClick={async () => {
                const start = prompt('Start date (YYYY-MM-DD):');
                const end = prompt('End date (YYYY-MM-DD):');
                if (!start || !end) return;
                await api('/me/leaves', { method: 'POST', body: JSON.stringify({ type: 'annual', start_date: start, end_date: end }) });
                setPortal(await api('/me/portal'));
              }}>Request leave</button>
            </div>

            <h3 style={{ marginTop: 14 }}>📅 My shifts (next 7 days)</h3>
            {portalShifts.length === 0 && <p className="muted">No shifts assigned yet.</p>}
            {portalShifts.map((sh) => (
              <div key={sh.id} className="inv-line">
                <span>{sh.date}</span>
                <span className="chip draft">{sh.shift}</span>
              </div>
            ))}

            <h3 style={{ marginTop: 14 }}>💵 My commissions</h3>
            {commissions.filter((c) => c.staff_id === jwtPayload()?.staff_id).map((c) => (
              <div key={c.staff_id}>
                <div className="inv-line"><span>Rate</span><span>{c.rate}%</span></div>
                <div className="inv-line"><span>This month ({c.period.paid_invoices} paid invoices · {fmt(c.period.sales_value)})</span><span className="inv-amt">{fmt(c.period.commission)}</span></div>
                <div className="inv-line"><span>All-time commission</span><span>{fmt(c.all_time.commission)}</span></div>
              </div>
            ))}
            {commissions.filter((c) => c.staff_id === jwtPayload()?.staff_id).length === 0 && <p className="muted">No commission data yet — your rate is set by HR.</p>}
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
        {nav.filter(([k]) => ['dashboard', 'customers', 'inbox', 'invoices', 'orders'].includes(k) && allowed(k)).map(([k, icon, label]) => (
          <div key={k} className={`bn-item ${view === k ? 'active' : ''}`} onClick={() => setView(k)}>
            <span>{icon}</span>{label}
          </div>
        ))}
        <div className={`bn-item ${moreOpen ? 'active' : ''}`} onClick={() => setMoreOpen(!moreOpen)}>
          <span>{moreOpen ? '✕' : '⋯'}</span>More
        </div>
      </nav>
      {moreOpen && (
        <div className="more-sheet" onClick={() => setMoreOpen(false)}>
          <div className="more-sheet-card" onClick={(e) => e.stopPropagation()}>
            <b className="muted">More</b>
            {nav.filter(([k]) => !['dashboard', 'customers', 'inbox', 'invoices'].includes(k) && allowed(k)).map(([k, icon, label]) => (
              <div key={k} className={`bn-item more-item ${view === k ? 'active' : ''}`} onClick={() => { setView(k); setMoreOpen(false); }}>
                <span>{icon}</span>{label}
              </div>
            ))}
          </div>
        </div>
      )}
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
        {sessionStorage.getItem('omnicrm_demo') && (
          <div className="demo-banner">
            👋 You're in a read-only guest demo — log in with <b>guest@omnicrm.ng</b> / <b>guest-demo</b> to explore. Changes are disabled.
          </div>
        )}
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
        <p className="muted demo">{sessionStorage.getItem('omnicrm_demo')
          ? 'Guest demo: guest@omnicrm.ng / guest-demo (read-only)'
          : 'Demo: grant@besconpaints.com / omnicrm-demo'}</p>
      </div>
    </div>
  );
}
