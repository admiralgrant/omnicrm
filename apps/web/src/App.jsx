import React, { useEffect, useState } from 'react';
import Icon from './Icon.jsx';

const API = '/api';
const tokenKey = 'omnicrm_token';
const FEATURE_KEYS = ['customers', 'inbox', 'invoices', 'followups', 'feedback', 'reports', 'ads', 'hr', 'pipeline', 'orders', 'chat', 'wallet'];
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
  }); // {name, dept, staff}, department-scoped login
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
  const [receiptForm, setReceiptForm] = useState(null);
  const [chatConvs, setChatConvs] = useState([]);
  const [chatStaff, setChatStaff] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [chatDraft, setChatDraft] = useState('');
  const [chatMentionOpen, setChatMentionOpen] = useState(false);
  const [chatMentioned, setChatMentioned] = useState([]);
  const [chatGroups, setChatGroups] = useState([]);
  const [dmPickerOpen, setDmPickerOpen] = useState(false);
  const [channelPickerOpen, setChannelPickerOpen] = useState(false);
  const [newChannelOpen, setNewChannelOpen] = useState(false);
  const [invEdit, setInvEdit] = useState(null); // draft invoice edit state
  const [moreOpen, setMoreOpen] = useState(false); // mobile overflow menu
  const [loading, setLoading] = useState(true);
  const [invTab, setInvTab] = useState('stock'); // inventory tabs: stock | movements | digest
  const [movements, setMovements] = useState([]);
  const [digest, setDigest] = useState(null);
  const [digestPeriod, setDigestPeriod] = useState('daily');
  const [stockInForm, setStockInForm] = useState(null); // { product_id, qty, note }
  const [drawerOpen, setDrawerOpen] = useState(false); // mobile hamburger drawer
  const [invUpdOpen, setInvUpdOpen] = useState(false); // inventory updates panel
  const [invUpdates, setInvUpdates] = useState([]);
  const [chatUnread, setChatUnread] = useState({}); // conv_id -> unseen count
  const [platformOrgs, setPlatformOrgs] = useState([]);
  const [walletData, setWalletData] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('omnicrm_theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('omnicrm_theme', theme);
  }, [theme]);
  const [chatWatermarks, setChatWatermarks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('omnicrm_chat_seen') || '{}'); } catch { return {}; }
  });

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
        const chat = await api('/chat/ensure-general');
        setChatConvs(chat.conversations);
        setChatStaff((await api('/chat/conversations')).staff);
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

  // real-time chat: poll unread counts every 8s; refresh the open conversation when new messages land
  useEffect(() => {
    if (!token) return;
    let alive = true;
    const poll = async () => {
      try {
        const q = '?watermarks=' + encodeURIComponent(JSON.stringify(chatWatermarksRef.current));
        const r = await api('/chat/unread' + q);
        if (!alive) return;
        const unread = {};
        for (const row of r.rows) if (row.unseen > 0) unread[row.conversation_id] = row.unseen;
        setChatUnread(unread);
        // refresh the open conversation if it has new messages
        if (activeConvRef.current?.conversation?.id) {
          const convId = activeConvRef.current.conversation.id;
          const wm = chatWatermarksRef.current[convId] || 0;
          const row = r.rows.find((x) => x.conversation_id === convId);
          if (row && row.last_message_id > wm) {
            const fresh = await api(`/chat/conversations/${convId}`);
            if (alive) setActiveConv(fresh);
            const seen = { ...chatWatermarksRef.current, [convId]: row.last_message_id };
            chatWatermarksRef.current = seen;
            setChatWatermarks(seen);
            localStorage.setItem('omnicrm_chat_seen', JSON.stringify(seen));
          }
        }
      } catch { /* server hiccup */ }
    };
    const iv = setInterval(poll, 8000);
    poll();
    return () => { alive = false; clearInterval(iv); };
  }, [token]);

  const chatWatermarksRef = React.useRef(chatWatermarks);
  chatWatermarksRef.current = chatWatermarks;
  const activeConvRef = React.useRef(activeConv);
  activeConvRef.current = activeConv;
  const totalChatUnread = Object.values(chatUnread).reduce((s, n) => s + n, 0);

  const markConvSeen = async (convId, lastMessageId) => {
    const seen = { ...chatWatermarks, [convId]: lastMessageId };
    setChatWatermarks(seen);
    localStorage.setItem('omnicrm_chat_seen', JSON.stringify(seen));
    setChatUnread((u) => { const n = { ...u }; delete n[convId]; return n; });
  };

  useEffect(() => {
    if (token && view === 'wallet') {
      (async () => { try { setWalletData(await api('/wallet')); } catch { /* n/a */ } })();
    }
  }, [view, token]);

  const login = async (email, password) => {
    if (sessionStorage.getItem('omnicrm_demo') && email !== 'guest@omnicrm.ng') {
      throw new Error('This demo link is guest-only. Sign in with guest@omnicrm.ng / guest-demo, or open the app without the demo link to sign in as an admin.');
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
    account: ['dashboard', 'invoices', 'orders', 'mail', 'reports', 'wallet'],
  };
  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };
  const allowed = (section) => {
    if (section === 'portal') return !!(me?.staff_id || me?.staff);
    if (orgFeats && orgFeats[section] === false) return false;
    if (!me || !me.dept) return true;
    return (FRONT_ACCESS[me.dept] || []).includes(section);
  };
  const isGuest = !!me?.guest; // read-only demo session, hide admin/mutating controls
  const opsMode = !me?.dept || me?.dept === 'account' || me?.dept === 'hr'; // can approve orders & post payments

  if (loading) return <div className="center">Loading…</div>;

  if (token && jwtPayload()?.platform_only) return <SuperAdminApp />;

  if (!token) {
    if (authMode === 'landing') return <Landing onLogin={() => setAuthMode('login')} onStart={() => setAuthMode('register')} theme={theme} onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />;
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
    const lines = invItems.map((it) => `• ${it.description} × ${it.qty}, ${fmtCur(it.amount, activeInv.currency)}`).join('\n');
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
    const lines = invItems.map((it) => `• ${it.description} × ${it.qty}, ${fmtCur(it.amount, activeInv.currency)}`).join('\n');
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
  const loadInvUpdates = async () => {
    try {
      const r = await api('/inventory-updates');
      setInvUpdates(r.rows);
    } catch { /* older api */ }
  };
  const invUnread = invUpdates.filter((n) => !n.read).length;
  const saveInvEdit = async () => {
    await api(`/invoices/${invEdit.id}`, { method: 'PUT', body: JSON.stringify({ due_date: invEdit.due_date, currency: invEdit.currency, items: invEdit.items }) });
    const [iv, det] = await Promise.all([api('/invoices'), api(`/invoices/${invEdit.id}`)]);
    setInvoices(iv.invoices); setInvCounts(iv.counts); setReceivables(iv.receivables);
    setActiveInv(det.invoice); setInvItems(det.items);
    setInvEdit(null);
  };

  const nav = [
    ['dashboard', 'home', 'Dashboard'],
    ['customers', 'users', 'Customers'],
    ['inbox', 'chat', 'Inbox'],
    ['invoices', 'receipt', 'Invoicing'],
    ['orders', 'package', 'Orders'],
    ['mail', 'mail', 'In-Mail'],
    ['followups', 'phone', 'Follow-ups'],
    ['feedback', 'file', 'Feedback'],
    ['reports', 'chart', 'Reports'],
    ['portal', 'user', 'My Portal'],
    ['ads', 'megaphone', 'Ads Studio'],
    ['wallet', 'wallet', 'Wallet'],
  ];

  const depts = [
    ['sales', 'trend', 'Sales'],
    ['support', 'buoy', 'Support'],
    ['inventory', 'package', 'Inventory'],
    ['product', 'tag', 'Product'],
    ['hr', 'briefcase', 'HR'],
    ['account', 'user', 'Account'],
  ];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo"><div className="logo-mark">O</div><div><b>OmniCRM</b><span>beta</span></div></div>
        {nav.filter(([k]) => allowed(k)).map(([k, icon, label]) => (
          <div key={k} className={`nav-item ${view === k ? 'active' : ''}`} onClick={() => setView(k)}>
            <span className="nav-ic"><Icon name={icon} size={17} /></span>{label}
            {k === 'mail' && totalChatUnread > 0 && <b className="unread-badge nav-unread">{totalChatUnread}</b>}
          </div>
        ))}
        <div className="nav-item" onClick={logout}><span className="nav-ic"><Icon name="logout" size={17} /></span>Log out</div>
      </aside>

      {/* mobile drawer: every destination behind the hamburger */}
      <div className={`drawer-backdrop ${drawerOpen ? 'open' : ''}`} onClick={() => setDrawerOpen(false)} />
      <aside className={`drawer ${drawerOpen ? 'open' : ''}`}>
        <div className="logo"><div className="logo-mark">O</div><div><b>OmniCRM</b><span>beta</span></div></div>
        {nav.filter(([k]) => allowed(k)).map(([k, icon, label]) => (
          <div key={k} className={`nav-item ${view === k ? 'active' : ''}`} onClick={() => { setView(k); setDrawerOpen(false); }}>
            <span className="nav-ic"><Icon name={icon} size={17} /></span>{label}
            {k === 'mail' && totalChatUnread > 0 && <b className="unread-badge nav-unread">{totalChatUnread}</b>}
          </div>
        ))}
        <div className="nav-item" onClick={logout}><span className="nav-ic"><Icon name="logout" size={17} /></span>Log out</div>
      </aside>

      <main className="main">
        <div className="topbar">
          <button className="icon-btn hamburger" onClick={() => setDrawerOpen(true)} aria-label="Open menu"><Icon name="menu" size={22} /></button>
          <div className="logo topbar-logo"><div className="logo-mark">O</div><div><b>OmniCRM</b><span>beta</span></div></div>
          <div className="topbar-actions">
            <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle dark mode">
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={19} />
            </button>
            <button className="icon-btn" onClick={() => { setInvUpdOpen(!invUpdOpen); setNotifOpen(false); if (!invUpdOpen) loadInvUpdates(); }} aria-label="Inventory updates">
              <Icon name="archive" size={20} />
              {invUnread > 0 && <b className="notif-badge">{invUnread}</b>}
            </button>
            <button className="icon-btn" onClick={() => { setNotifOpen(!notifOpen); setInvUpdOpen(false); }} aria-label="Notifications">
              <Icon name="bell" size={20} />
              {!notifOpen && notifs.filter((n) => !n.read && n.kind !== 'inventory_digest').length > 0 && <b className="notif-badge">{notifs.filter((n) => !n.read && n.kind !== 'inventory_digest').length}</b>}
              {notifOpen && <b className="notif-badge"><Icon name="x" size={10} /></b>}
            </button>
            {invUpdOpen && <div className="notif-backdrop" onClick={() => setInvUpdOpen(false)} />}
            {invUpdOpen && (
              <div className="notif-panel">
                <div className="inv-head" style={{ marginBottom: 6 }}>
                  <b><Icon name="archive" size={14} /> Inventory Updates</b>
                  <button className="btn-ghost sm" style={{ color: '#c0392b' }} onClick={() => setInvUpdOpen(false)}>Close</button>
                </div>
                {invUpdates.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No inventory updates yet. The daily digest arrives at 8am.</p>}
                {invUpdates.map((n) => (
                  <div key={n.id} className="notif-line" style={{ opacity: n.read ? 0.55 : 1, cursor: 'pointer' }}
                    onClick={async () => {
                      await api('/notifications/read', { method: 'POST', body: JSON.stringify({ id: n.id }) });
                      const p = n.link?.period || 'daily';
                      setInvUpdOpen(false);
                      setView('dashboard'); setDept('inventory'); setInvTab('digest'); setDigestPeriod(p);
                      setDigest((await api(`/ai/inventory-digest?period=${p}`)).digest);
                      loadInvUpdates();
                    }}>
                    <span style={{ fontSize: 13 }}>{n.message} <span className="notif-go"><Icon name="chevR" size={12} /></span></span>
                  </div>
                ))}
              </div>
            )}
            {notifOpen && <div className="notif-backdrop" onClick={() => setNotifOpen(false)} />}
            {notifOpen && (
              <div className="notif-panel">
                <div className="inv-head" style={{ marginBottom: 6 }}>
                  <b>Notifications</b>
                  <button className="btn-ghost sm" onClick={async () => { await api('/notifications/read', { method: 'POST' }); setNotifs((await api('/notifications')).rows); }}>Mark all read</button>
                  <button className="btn-ghost sm" style={{ color: '#c0392b' }} onClick={() => setNotifOpen(false)}>Close</button>
                </div>
                {notifs.filter((n) => n.kind !== 'inventory_digest').map((n) => (
                  <div key={n.id} className="notif-line" style={{ opacity: n.read ? 0.55 : 1, cursor: 'pointer' }}
                    onClick={async () => {
                      const link = n.link;
                      try {
                        if (link) {
                          if (link.view === 'mail') {
                            setView('mail');
                            if (link.id) setActiveConv(await api(`/chat/conversations/${link.id}`));
                          } else if (link.view === 'orders') {
                            setView('orders');
                          } else if (link.view === 'invoices') {
                            setView('invoices');
                          } else if (link.view === 'dashboard') {
                            setView('dashboard');
                            setDept(link.dept || 'sales');
                          } else if (link.view === 'inventory') {
                            setView('dashboard');
                            setDept('inventory');
                          } else if (link.view === 'wallet') {
                            setView('wallet');
                          }
                        } else if (n.kind === 'mention') {
                          setView('mail');
                        } else {
                          setNotifOpen(false);
                          await api('/notifications/read', { method: 'POST', body: JSON.stringify({ id: n.id }) });
                          setNotifs((await api('/notifications')).rows);
                          return;
                        }
                        setNotifOpen(false);
                        await api('/notifications/read', { method: 'POST', body: JSON.stringify({ id: n.id }) });
                        setNotifs((await api('/notifications')).rows);
                      } catch (e) { console.error(e); }
                    }}>
                    <span className="notif-ic"><Icon name={n.kind === 'payment_received' ? 'banknote' : n.kind === 'order_delivered' ? 'truck' : n.kind === 'order_approved' ? 'check' : n.kind === 'order_rejected' ? 'x' : n.kind === 'mention' ? 'chat' : n.kind === 'stock_update' ? 'package' : n.kind === 'receipt' ? 'camera' : n.kind === 'wallet' ? 'wallet' : 'bell'} size={14} /></span>
                    <span style={{ fontSize: 13 }}>{n.message} {n.link && <span className="notif-go"><Icon name="chevR" size={12} /></span>}</span>
                  </div>
                ))}
                {notifs.filter((n) => n.kind !== 'inventory_digest').length === 0 && <p className="muted" style={{ fontSize: 13 }}>Nothing yet. Order updates will land here.</p>}
              </div>
            )}
          </div>
        </div>
        {jwtPayload()?.imp_by && (
          <div className="imp-banner">
            <span><Icon name="shield" size={14} /> You're viewing an organization as a platform admin.</span>
            <button className="btn-ghost sm" onClick={async () => {
              try {
                const r = await api('/platform/exit', { method: 'POST' });
                localStorage.setItem(tokenKey, r.token);
                location.reload();
              } catch (e) { alert(e.message || 'Could not return to the platform console'); }
            }}><Icon name="left" size={13} /> Return to Platform Console</button>
          </div>
        )}
        {view === 'dashboard' && dash && (
          <>
            <h1>{greeting()}{me?.name ? `, ${me.name.split(' ')[0]}` : ''}{me?.dept ? <span className="dept-tag">{me.dept}</span> : null}{me?.guest ? <span className="dept-tag guest-tag">read-only</span> : null}</h1>
            <div className="dept-pills">
              {depts.filter(([k]) => allowed(k)).map(([k, icon, label]) => (
                <button key={k} className={`pill ${dept === k ? 'active' : ''}`} onClick={() => setDept(k)}><Icon name={icon} size={15} /> {label}</button>
              ))}
            </div>
            <div className="quick-actions" style={{ marginTop: 0, marginBottom: 14 }}>
              <button className="btn-ghost sm" onClick={() => generateDeptReport(dept)}><Icon name="chart" size={14} /> {reportPeriod} report for this section</button>
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
                    <h3><Icon name="sparkles" size={14} /> AI Follow-ups ready</h3>
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
                    <h3><Icon name="repeat" size={14} /> Sales Pipeline</h3>
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
                <h3>{tktForm.id ? 'Edit ticket' : 'New ticket'}</h3>
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
                  {tktForm.id && <button className="btn-ghost" style={{ color: '#c0392b' }} onClick={deleteTicket}><Icon name="trash" size={14} /> Delete</button>}
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
                  <div className="inv-head"><h3><Icon name="buoy" size={14} /> Support Tickets</h3><button className="btn-primary sm" onClick={openNewTicket}>+ New ticket</button></div>
                  {tickets.map((t) => (
                    <div key={t.id} className="ticket">
                      <div className="ticket-info">
                        <b>{t.subject}</b>
                        <span>{t.company || t.name || 'General'} · {t.created_at}</span>
                      </div>
                      <span className={`chip ${t.status}`}>{t.status}</span>
                      <span className={`chip pri-${t.priority}`}>{t.priority}</span>
                      <button className="btn-ghost sm" onClick={() => openEditTicket(t)}><Icon name="pencil" size={14} /></button>
                    </div>
                  ))}
                </div>
              </>
            ))}

            {dept === 'inventory' && (prodView === 'form' && prodForm ? (
              <div className="card">
                <h3>{prodForm.id ? 'Edit product' : 'Add product'}</h3>
                <label className="inv-label">Product name</label>
                <input placeholder="e.g. Emulsion Paint, Ocean Blue 20L" value={prodForm.name} onChange={(e) => setProdForm({ ...prodForm, name: e.target.value })} />
                <div className="inv-item-row">
                  <div className="inv-field">
                    <label className="inv-label">SKU (stock code)</label>
                    <input placeholder="e.g. P-EMU-4L" value={prodForm.sku} onChange={(e) => setProdForm({ ...prodForm, sku: e.target.value })} />
                  </div>
                  <div className="inv-field">
                    <label className="inv-label">Category</label>
                    <input placeholder="e.g. Emulsion, Gloss, Primer" value={prodForm.category} onChange={(e) => setProdForm({ ...prodForm, category: e.target.value })} />
                  </div>
                </div>
                <div className="inv-item-row">
                  <div className="inv-field">
                    <label className="inv-label">Stock quantity</label>
                    <input type="number" min="0" placeholder="Units in store" value={prodForm.stock} onChange={(e) => setProdForm({ ...prodForm, stock: e.target.value })} />
                  </div>
                  <div className="inv-field">
                    <label className="inv-label">Low-stock alert at</label>
                    <input type="number" min="0" placeholder="Warn me below this" value={prodForm.low_stock_at} onChange={(e) => setProdForm({ ...prodForm, low_stock_at: e.target.value })} />
                  </div>
                </div>
                <div className="inv-item-row">
                  <div className="inv-field">
                    <label className="inv-label">Unit cost (₦)</label>
                    <input type="number" min="0" placeholder="What it costs you" value={prodForm.unit_cost} onChange={(e) => setProdForm({ ...prodForm, unit_cost: e.target.value })} />
                  </div>
                  <div className="inv-field">
                    <label className="inv-label">Unit price (₦)</label>
                    <input type="number" min="0" placeholder="What customers pay" value={prodForm.unit_price} onChange={(e) => setProdForm({ ...prodForm, unit_price: e.target.value })} />
                  </div>
                </div>
                <div className="quick-actions">
                  <button className="btn-primary" onClick={saveProduct}>{prodForm.id ? 'Save changes' : 'Add product'}</button>
                  <button className="btn-ghost" onClick={() => { setProdView('list'); setProdForm(null); }}>Cancel</button>
                  {prodForm.id && <button className="btn-ghost" style={{ color: '#c0392b' }} onClick={deleteProduct}><Icon name="trash" size={14} /> Delete</button>}
                </div>
              </div>
            ) : (
              <>
                <div className="kpis">
                  <div className="kpi"><div className="label">Stock value (cost)</div><div className="value">{fmt(stockValue)}</div></div>
                  <div className="kpi"><div className="label">Low-stock alerts</div><div className="value">{lowCount}</div></div>
                  <div className="kpi"><div className="label">SKUs tracked</div><div className="value">{products.length}</div></div>
                </div>
                <div className="dept-pills">
                  <button className={`pill ${invTab === 'stock' ? 'active' : ''}`} onClick={() => setInvTab('stock')}>Stock</button>
                  <button className={`pill ${invTab === 'movements' ? 'active' : ''}`} onClick={async () => { setInvTab('movements'); setMovements((await api('/stock/movements?days=30')).rows); }}>Movements</button>
                  <button className={`pill ${invTab === 'digest' ? 'active' : ''}`} onClick={async () => { setInvTab('digest'); setDigest((await api(`/ai/inventory-digest?period=${digestPeriod}`)).digest); }}>AI Digest</button>
                </div>
                {invTab === 'stock' && (stockInForm ? (
                  <div className="card">
                    <h3><Icon name="down" size={14} /> Stock in, new stock received</h3>
                    <label className="inv-label">Product</label>
                    <select value={stockInForm.product_id} onChange={(e) => setStockInForm({ ...stockInForm, product_id: e.target.value })}>
                      <option value="">Select product…</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name} (now: {p.stock})</option>)}
                    </select>
                    <div className="inv-item-row">
                      <div className="inv-field">
                        <label className="inv-label">Quantity added</label>
                        <input type="number" min="1" placeholder="e.g. 20" value={stockInForm.qty} onChange={(e) => setStockInForm({ ...stockInForm, qty: e.target.value })} />
                      </div>
                      <div className="inv-field">
                        <label className="inv-label">Note</label>
                        <input placeholder="Supplier / waybill…" value={stockInForm.note} onChange={(e) => setStockInForm({ ...stockInForm, note: e.target.value })} />
                      </div>
                    </div>
                    <div className="quick-actions">
                      <button className="btn-primary" onClick={async () => {
                        if (!stockInForm.product_id || !(Number(stockInForm.qty) > 0)) { alert('Pick a product and enter a quantity'); return; }
                        await api('/stock/in', { method: 'POST', body: JSON.stringify(stockInForm) });
                        setStockInForm(null);
                        const p = await api('/products'); setProducts(p.products); setStockValue(p.stock_value); setLowCount(p.low_count);
                      }}>Add stock</button>
                      <button className="btn-ghost" onClick={() => setStockInForm(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="card">
                    <div className="inv-head"><h3><Icon name="package" size={14} /> Inventory</h3><div><button className="btn-ghost sm" onClick={() => setStockInForm({ product_id: '', qty: 1, note: '' })}><Icon name="down" size={14} /> Stock in</button> <button className="btn-primary sm" onClick={openNewProduct}>+ Add product</button></div></div>
                    {products.map((p) => (
                      <div key={p.id} className="inv-row">
                        <div className="thread-ava"><Icon name="package" size={14} /></div>
                        <div className="thread-info">
                          <b>{p.name}</b>
                          <span>{p.sku} · {p.category} · alert at {p.low_stock_at}</span>
                        </div>
                        <div className="inv-right">
                          <div className="inv-amt">{p.stock} units</div>
                          {p.low && <span className="chip low">low stock</span>}
                          <button className="btn-ghost sm" onClick={() => openEditProduct(p)}><Icon name="pencil" size={14} /> Edit</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                {invTab === 'movements' && (
                  <div className="card">
                    <div className="inv-head"><h3><Icon name="repeat" size={14} /> Stock movements, last 30 days</h3>
                      <div>
                        <button className="btn-ghost sm" onClick={async () => setMovements((await api('/stock/movements?days=30')).rows)}>All</button>
                        <button className="btn-ghost sm" onClick={async () => setMovements((await api('/stock/movements?days=30&direction=in')).rows)}>In only</button>
                        <button className="btn-ghost sm" onClick={async () => setMovements((await api('/stock/movements?days=30&direction=out')).rows)}>Out only</button>
                      </div>
                    </div>
                    {movements.length === 0 && <p className="muted">No movements recorded yet.</p>}
                    {movements.map((m) => (
                      <div key={m.id} className="inv-row">
                        <div className="thread-ava">{m.direction === 'in' ? <Icon name="down" size={16} /> : <Icon name="up" size={16} />}</div>
                        <div className="thread-info">
                          <b>{m.product_name}</b>
                          <span>{m.direction === 'in' ? '+' : '−'}{m.qty} · {m.reason}{m.ref_type && m.ref_id ? ` · ${m.ref_type} #${m.ref_id}` : ''}{m.note ? ' · ' + m.note : ''}</span>
                        </div>
                        <div className="inv-right muted" style={{ fontSize: 12 }}>{(m.created_at || '').slice(0, 16)}{m.by_name ? ' · ' + m.by_name : ''}</div>
                      </div>
                    ))}
                  </div>
                )}
                {invTab === 'digest' && (
                  <div className="card">
                    <h3><Icon name="chart" size={14} /> AI Inventory Digest</h3>
                    <div className="dept-pills">
                      {[['daily', 'Today'], ['weekly', 'Week'], ['monthly', 'Month'], ['quarterly', 'Quarter'], ['biannual', 'Half-year'], ['year', 'Year-end']].map(([k, label]) => (
                        <button key={k} className={`pill ${digestPeriod === k ? 'active' : ''}`} onClick={async () => { setDigestPeriod(k); setDigest((await api(`/ai/inventory-digest?period=${k}`)).digest); }}>{label}</button>
                      ))}
                    </div>
                    {!digest && <button className="btn-primary" onClick={async () => setDigest((await api(`/ai/inventory-digest?period=${digestPeriod}`)).digest)}>Generate digest</button>}
                    {digest && (
                      <div className="report">
                        <h3 style={{ marginTop: 10 }}>{digest.label}: +{digest.added} in · −{digest.sold} out</h3>
                        <ul className="ads-list">
                          <li>{digest.skus} SKUs tracked · stock value {fmt(digest.stock_value)} (cost)</li>
                          <li>{digest.low_count} low-stock item{digest.low_count === 1 ? '' : 's'} needing reorder</li>
                          {digest.negatives.length > 0 && <li style={{ color: '#c0392b' }}><Icon name="alert" size={14} /> Negative stock: {digest.negatives.join(', ')}</li>}
                        </ul>
                        {digest.additions.length > 0 && <b style={{ display: 'block', marginTop: 8 }}><Icon name="down" size={14} /> Added</b>}
                        {digest.additions.map((a, i) => <div key={i} className="inv-line muted"><span>{a.product}</span><span>+{a.qty}</span></div>)}
                        {digest.sold_items.length > 0 && <b style={{ display: 'block', marginTop: 8 }}><Icon name="up" size={14} /> Sold</b>}
                        {digest.sold_items.map((s, i) => <div key={i} className="inv-line muted"><span>{s.product}</span><span>−{s.qty}</span></div>)}
                        {digest.low_items.length > 0 && <b style={{ display: 'block', marginTop: 8 }}><Icon name="alert" size={14} /> Low stock</b>}
                        {digest.low_items.map((l, i) => <div key={i} className="inv-line muted"><span>{l.product}</span><span>{l.stock} left (alert at {l.alert_at})</span></div>)}
                      </div>
                    )}
                  </div>
                )}
              </>
            ))}

            {dept === 'product' && (prodView === 'form' && prodForm ? (
              <div className="card">
                <h3>{prodForm.id ? 'Edit product' : 'Add product'}</h3>
                <label className="inv-label">Product name</label>
                <input placeholder="e.g. Emulsion Paint, Ocean Blue 20L" value={prodForm.name} onChange={(e) => setProdForm({ ...prodForm, name: e.target.value })} />
                <div className="inv-item-row">
                  <div className="inv-field">
                    <label className="inv-label">SKU (stock code)</label>
                    <input placeholder="e.g. P-EMU-4L" value={prodForm.sku} onChange={(e) => setProdForm({ ...prodForm, sku: e.target.value })} />
                  </div>
                  <div className="inv-field">
                    <label className="inv-label">Category</label>
                    <input placeholder="e.g. Emulsion, Gloss, Primer" value={prodForm.category} onChange={(e) => setProdForm({ ...prodForm, category: e.target.value })} />
                  </div>
                </div>
                <div className="inv-item-row">
                  <div className="inv-field">
                    <label className="inv-label">Stock quantity</label>
                    <input type="number" min="0" placeholder="Units in store" value={prodForm.stock} onChange={(e) => setProdForm({ ...prodForm, stock: e.target.value })} />
                  </div>
                  <div className="inv-field">
                    <label className="inv-label">Low-stock alert at</label>
                    <input type="number" min="0" placeholder="Warn me below this" value={prodForm.low_stock_at} onChange={(e) => setProdForm({ ...prodForm, low_stock_at: e.target.value })} />
                  </div>
                </div>
                <div className="inv-item-row">
                  <div className="inv-field">
                    <label className="inv-label">Unit cost (₦)</label>
                    <input type="number" min="0" placeholder="What it costs you" value={prodForm.unit_cost} onChange={(e) => setProdForm({ ...prodForm, unit_cost: e.target.value })} />
                  </div>
                  <div className="inv-field">
                    <label className="inv-label">Unit price (₦)</label>
                    <input type="number" min="0" placeholder="What customers pay" value={prodForm.unit_price} onChange={(e) => setProdForm({ ...prodForm, unit_price: e.target.value })} />
                  </div>
                </div>
                <div className="quick-actions">
                  <button className="btn-primary" onClick={saveProduct}>{prodForm.id ? 'Save changes' : 'Add product'}</button>
                  <button className="btn-ghost" onClick={() => { setProdView('list'); setProdForm(null); }}>Cancel</button>
                  {prodForm.id && <button className="btn-ghost" style={{ color: '#c0392b' }} onClick={deleteProduct}><Icon name="trash" size={14} /> Delete</button>}
                </div>
              </div>
            ) : (
              <div className="card">
                <div className="inv-head"><h3><Icon name="tag" size={14} /> Product Catalog</h3><button className="btn-primary sm" onClick={openNewProduct}>+ Add product</button></div>
                {products.map((p) => (
                  <div key={p.id} className="prod">
                    <div className="ticket-info"><b>{p.name}</b><span>{p.sku} · {p.category}</span></div>
                    <div className="prod-meta">
                      <div><span className="muted">Stock</span> {p.stock}</div>
                      <div><span className="muted">Price</span> {fmt(p.unit_price)}</div>
                      <div><span className="muted">Margin</span> {p.margin}%</div>
                    </div>
                    <button className="btn-ghost sm" onClick={() => openEditProduct(p)}><Icon name="pencil" size={14} /></button>
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
                      <h3 style={{ marginTop: 8 }}><Icon name="plus" size={14} /> Salary advance</h3>
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
                      <h3 style={{ marginTop: 8 }}><Icon name="plus" size={14} /> Leave request</h3>
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
                        <button className="btn-ghost sm" onClick={() => setHrForm({ id: s.id, name: s.name, email: s.email || '', phone: s.phone || '', department: s.department, role: s.role, salary: s.salary, bank: s.bank || '', pension_rate: s.pension_rate, hmo_plan: s.hmo_plan || '', onboarding: s.onboarding, next_of_kin: s.next_of_kin || '', password: '' })}><Icon name="pencil" size={14} /></button>
                      </div>
                    </div>
                  ))}

                  {hrTab === 'advances' && hr.advances.map((a) => (
                    <div key={a.id} className="inv-row">
                      <div className="thread-ava"><Icon name="banknote" size={14} /></div>
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
                      <div className="thread-ava"><Icon name="calendar" size={14} /></div>
                      <div className="thread-info">
                        <b>{l.name}, {l.type} leave</b>
                        <span>{l.start_date} → {l.end_date}</span>
                      </div>
                      <div className="inv-right">
                        <span className={`chip ${l.status === 'pending' ? 'open' : l.status === 'approved' ? 'closed' : 'low'}`}>{l.status}</span>
                        {l.status === 'pending' && (
                          <div className="quick-actions">
                            <button className="btn-primary sm" onClick={async () => { await api(`/leaves/${l.id}`, { method: 'PUT', body: JSON.stringify({ status: 'approved' }) }); setHr(await api('/hr-dashboard')); }}><Icon name="check" size={14} /></button>
                            <button className="btn-ghost sm" onClick={async () => { await api(`/leaves/${l.id}`, { method: 'PUT', body: JSON.stringify({ status: 'rejected' }) }); setHr(await api('/hr-dashboard')); }}><Icon name="x" size={14} /></button>
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
                            <button className="btn-ghost" onClick={() => setActiveRun(null)}><Icon name="chevL" size={12} /></button>
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
                              <div className="thread-ava"><Icon name="receipt" size={14} /></div>
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
                                }}><Icon name="download" size={14} /> PDF</button>
                              </div>
                            </div>
                          ))}
                          <div className="quick-actions">
                            {activeRun.run.status === 'draft' && <button className="btn-primary" onClick={async () => { const d = await api(`/payroll/runs/${activeRun.run.id}`, { method: 'PUT', body: JSON.stringify({ status: 'approved' }) }); setActiveRun({ ...activeRun, run: d.run }); setPayrollRuns((await api('/payroll/runs')).runs); }}>Approve payroll</button>}
                            {activeRun.run.status === 'approved' && <button className="btn-primary" onClick={async () => { const d = await api(`/payroll/runs/${activeRun.run.id}`, { method: 'PUT', body: JSON.stringify({ status: 'paid' }) }); setActiveRun({ ...activeRun, run: d.run }); setPayrollRuns((await api('/payroll/runs')).runs); setRemit(await api('/remittances')); }}>Mark as paid <Icon name="check" size={14} /></button>}
                            <button className="btn-ghost" onClick={async () => {
                              const res = await fetch(`${API}/payroll/runs/${activeRun.run.id}/journal.csv`, { headers: { Authorization: `Bearer ${localStorage.getItem(tokenKey)}` } });
                              const blob = await res.blob();
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url; a.download = `payroll-journal-${activeRun.run.period}.csv`;
                              document.body.appendChild(a); a.click(); a.remove();
                              URL.revokeObjectURL(url);
                            }}><Icon name="download" size={14} /> Journal CSV (accountant)</button>
                          </div>
                        </>
                      ) : (
                        <>
                          {payrollRuns.length === 0 && <p className="muted">No payroll runs yet, run this month's payroll to generate payslips.</p>}
                          {payrollRuns.map((r) => (
                            <div key={r.id} className="inv-row" onClick={async () => setActiveRun(await api(`/payroll/runs/${r.id}`))}>
                              <div className="thread-ava"><Icon name="banknote" size={14} /></div>
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
                      <p className="muted">Today's attendance, staff clock in from their portal or you can do it for them.</p>
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
                        <div className="kpi"><div className="label">Next due</div><div className="value" style={{ fontSize: 16 }}>{remit.next_due ? `${remit.next_due.type.toUpperCase()} · ${remit.next_due.due_date}` : ', '}</div></div>
                      </div>
                      <p className="muted">Filing calendar: PAYE due by the 10th of the following month · pension (staff 8% + employer 10%) due ~7 days after salary payment.</p>
                      {remit.remittances.map((r) => (
                        <div key={r.id} className="inv-row">
                          <div className="thread-ava">{r.type === 'paye' ? <Icon name="building" size={16} /> : <Icon name="shield" size={16} />}</div>
                          <div className="thread-info">
                            <b>{r.type.toUpperCase()}, {r.period}</b>
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
                      <p className="muted">Next 7 days, pick each staff member's shift.</p>
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
                                    <option value="morning"><Icon name="clock" size={14} /> Morning</option>
                                    <option value="afternoon"><Icon name="clock" size={14} /> Afternoon</option>
                                    <option value="night"><Icon name="clock" size={14} /> Night</option>
                                    <option value="off"><Icon name="clock" size={14} /> Off</option>
                                  </select>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </>
                  )}
                  {hr.staff.length === 0 && <p className="muted">No staff yet, add your first team member.</p>}
                </div>
              </>
            )}

            {dept === 'account' && account && (
              <div className="card">
                <h3><Icon name="user" size={14} /> Account</h3>
                <div className="inv-line"><span>Business</span><span>{account.user.business_name || ', '}</span></div>
                <div className="inv-line"><span>Owner</span><span>{account.user.name}</span></div>
                <div className="inv-line"><span>Email</span><span>{account.user.email}</span></div>
                <div className="inv-line"><span>Plan</span><span className="chip closed">{account.plan}</span></div>
                <h3 style={{ marginTop: 14 }}><Icon name="banknote" size={14} /> Billing</h3>
                <div className="inv-line"><span>Conversion fees earned</span><span>{fmt(account.billing.fees_earned_ngn)}</span></div>
                <div className="inv-line"><span>Receivables outstanding</span><span>{fmt(account.billing.receivables_ngn)}</span></div>
                <div className="inv-line"><span>Paid invoices (all time)</span><span>{fmt(account.billing.paid_total_ngn)}</span></div>
                <div className="inv-line"><span>Foreign-currency invoices</span><span>{account.billing.foreign_invoices}</span></div>
                <h3 style={{ marginTop: 14 }}><Icon name="settings" size={14} /> Integrations</h3>
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
                {jwtPayload()?.platform && (
                  <>
                    <h3 style={{ marginTop: 14 }}><Icon name="shield" size={14} /> Platform console</h3>
                    <p className="muted">You sit above every organization: enter any org, reset passwords, control features. Every action is logged.</p>
                    <button className="btn-ghost sm" onClick={async () => setPlatformOrgs((await api('/platform/orgs')).orgs)}><Icon name="refresh" size={13} /> Load organizations</button>
                    {platformOrgs.map((o) => (
                      <div key={o.id} className="inv-line" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between' }}>
                          <span><b>{o.business_name || o.email}</b> {o.is_guest ? <span className="chip draft">guest</span> : null}{o.id === jwtPayload()?.id ? <span className="chip closed">you</span> : null}</span>
                          <span className="muted" style={{ fontSize: 11 }}>{o.staff} staff · {o.contacts} contacts · {o.invoices} invoices</span>
                        </div>
                        <div className="quick-actions" style={{ marginTop: 0 }}>
                          {o.id !== jwtPayload()?.id && (
                            <button className="btn-ghost sm" onClick={async () => {
                              if (!window.confirm(`Sign in as ${o.business_name || o.email}? Your session switches to their account (2h). Audit logged.`)) return;
                              const r = await api('/platform/impersonate', { method: 'POST', body: JSON.stringify({ user_id: o.id }) });
                              localStorage.setItem(tokenKey, r.token);
                              location.reload();
                            }}><Icon name="right" size={13} /> Log in as this org</button>
                          )}
                          <button className="btn-ghost sm" onClick={async () => {
                            const np = window.prompt(`New password for ${o.business_name || o.email} (min 8 chars):`);
                            if (!np) return;
                            await api(`/platform/orgs/${o.id}/password`, { method: 'POST', body: JSON.stringify({ new_password: np }) });
                            alert('Password reset and audit-logged.');
                          }}><Icon name="settings" size={13} /> Reset password</button>
                          <button className="btn-ghost sm" onClick={async () => {
                            const feats = o.features || {};
                            const all = !Object.values(feats).some((v) => v === false);
                            const next = {};
                            for (const k of ['customers', 'inbox', 'invoices', 'followups', 'feedback', 'reports', 'ads', 'hr', 'pipeline', 'orders', 'chat']) next[k] = !all;
                            await api(`/platform/orgs/${o.id}/features`, { method: 'PUT', body: JSON.stringify({ features: { ...feats, ...next } }) });
                            setPlatformOrgs((await api('/platform/orgs')).orgs);
                          }}><Icon name="trend" size={13} /> {Object.values(o.features || {}).some((v) => v === false) ? 'Enable all features' : 'Disable all features'}</button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
                <h3 style={{ marginTop: 14 }}><Icon name="settings" size={14} /> Feature access (who sees what)</h3>
                {isGuest ? (
                  <p className="muted">Feature access is managed by the organization owner, not available in guest mode.</p>
                ) : (
                  <>
                <p className="muted">Switch off any section and it disappears from every staff member's app instantly.</p>
                {[['customers', 'Customers'], ['inbox', 'WhatsApp Inbox'], ['invoices', 'Invoicing'], ['followups', 'Follow-ups'], ['feedback', 'Feedback'], ['reports', 'Reports'], ['ads', 'Ads Studio'], ['hr', 'HR'], ['pipeline', 'Pipeline']].map(([k, label]) => (
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
                    <h3 style={{ marginTop: 14 }}><Icon name="users" size={14} /> Staff & departments</h3>
                    <p className="muted">Assign staff to a department, they only see what that department can access.</p>
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
                <h3 style={{ marginTop: 14 }}><Icon name="link" size={14} /> Demo links (shareable, revocable)</h3>
                <p className="muted">Demo links are managed from the Platform Console. Ask your platform admin for one.</p>
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
            <h3>{custForm.id ? 'Edit customer' : 'Add customer'}</h3>
            <div className="inv-item-row">
              <div className="inv-field">
                <label className="inv-label">Contact name</label>
                <input placeholder="e.g. Gloria Okon" value={custForm.name} onChange={(e) => setCustForm({ ...custForm, name: e.target.value })} />
              </div>
              <div className="inv-field">
                <label className="inv-label">Company</label>
                <input placeholder="e.g. Eko Maintenance Ltd" value={custForm.company} onChange={(e) => setCustForm({ ...custForm, company: e.target.value })} />
              </div>
            </div>
            <div className="inv-item-row">
              <div className="inv-field">
                <label className="inv-label">Phone</label>
                <input placeholder="e.g. 08031234567" value={custForm.phone} onChange={(e) => setCustForm({ ...custForm, phone: e.target.value })} />
              </div>
              <div className="inv-field">
                <label className="inv-label">Email</label>
                <input placeholder="e.g. buyer@company.com" value={custForm.email} onChange={(e) => setCustForm({ ...custForm, email: e.target.value })} />
              </div>
            </div>
            <div className="inv-item-row">
              <div className="inv-field">
                <label className="inv-label">Tags (comma-separated)</label>
                <input placeholder="e.g. fm, lekki, tier-1" value={custForm.tags} onChange={(e) => setCustForm({ ...custForm, tags: e.target.value })} />
              </div>
              <div className="inv-field">
                <label className="inv-label">Pipeline stage</label>
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
            </div>
            <div className="inv-item-row">
              <div className="inv-field">
                <label className="inv-label">Sales rep (gets the commission)</label>
                <select value={custForm.staff_id || ''} onChange={(e) => setCustForm({ ...custForm, staff_id: e.target.value || null })}>
                  <option value="">Unassigned</option>
                  {(hr?.staff || []).filter((s) => s.department === 'sales').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div className="inv-item-row">
              <div className="inv-field">
                <label className="inv-label">Deal value (₦)</label>
                <input type="number" min="0" placeholder="Value of the deal" value={custForm.deal_value_ngn} onChange={(e) => setCustForm({ ...custForm, deal_value_ngn: e.target.value })} />
              </div>
              <div className="inv-field">
                <label className="inv-label">Current debt (₦)</label>
                <input type="number" min="0" placeholder="Outstanding balance" value={custForm.debt_ngn} onChange={(e) => setCustForm({ ...custForm, debt_ngn: e.target.value })} />
              </div>
            </div>
            <div className="quick-actions">
              <button className="btn-primary" onClick={saveCustomer}>{custForm.id ? 'Save changes' : 'Add customer'}</button>
              <button className="btn-ghost" onClick={() => { setCustView('list'); setCustForm(null); }}>Cancel</button>
              {custForm.id && <button className="btn-ghost" style={{ color: '#c0392b' }} onClick={deleteCustomer}><Icon name="trash" size={14} /> Delete</button>}
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
                  <button className="btn-ghost sm" onClick={() => openEditCustomer(c)}><Icon name="pencil" size={14} /> Edit</button>
                </div>
              </div>
            ))}
          </div>
        ))}

        {view === 'inbox' && (
          <div className="card inbox">
            {!activeContact ? (
              <>
                <h3><Icon name="chat" size={14} /> WhatsApp Inbox</h3>
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
                  <button className="btn-ghost" onClick={backToThreads}><Icon name="chevL" size={12} /></button>
                  <div className="thread-ava">{((activeContact.company || activeContact.name) || '?')[0]}</div>
                  <div><b>{activeContact.company || activeContact.name}</b><span className="muted">{activeContact.phone || 'WhatsApp'}</span></div>
                </div>
                <div className="bubbles">
                  {msgs.map((m) => (
                    <div key={m.id} className={`bubble ${m.direction === 'in' ? 'in' : 'out'}`}>{m.body}</div>
                  ))}
                  {draft && (
                    <div className="bubble draft">
                      <b><Icon name="sparkles" size={14} /> AI DRAFT, approve to send</b>
                      {draft}
                      <div className="draft-acts">
                        <button className="btn-primary sm" onClick={sendMsg}>Approve & Send</button>
                        <button className="btn-ghost sm" onClick={() => { setComposer(draft); setDraft(''); }}>Edit</button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="composer">
                  {!isGuest && <button className="btn-ghost sm" onClick={getDraft}><Icon name="sparkles" size={14} /> AI Draft</button>}
                  <input
                    placeholder={isGuest ? 'Read-only guest mode, sending is disabled' : 'Type a message…'}
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
              <h3><Icon name="package" size={14} /> Orders{opsMode ? '' : ', yours'}</h3>
              {!isGuest && <button className="btn-primary sm" onClick={() => setOrderForm({ contact_id: '', kind: 'catalog', items: [{ product_id: '', qty: 1 }], note: '', payment_terms: '' })}>+ Raise order</button>}
            </div>
            {orderForm && (
              <div className="card" style={{ background: '#f7faf8' }}>
                <h3 style={{ marginTop: 0 }}>New order</h3>
                <div className="inv-item-row">
                  <div className="inv-field">
                    <label className="inv-label">Customer</label>
                    <select value={orderForm.contact_id} onChange={(e) => setOrderForm({ ...orderForm, contact_id: e.target.value })}>
                      <option value="">Select customer…</option>
                      {(opsMode ? contacts : myContacts).map((c) => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
                    </select>
                  </div>
                  <div className="inv-field">
                    <label className="inv-label">Order type</label>
                    <select value={orderForm.kind || 'catalog'} onChange={(e) => setOrderForm({ ...orderForm, kind: e.target.value })}>
                      <option value="catalog">From catalog (registered products)</option>
                      <option value="custom">Customised order (write what's needed)</option>
                    </select>
                  </div>
                </div>
                {orderForm.kind === 'catalog' ? (
                  <>
                    <label className="inv-label" style={{ marginTop: 10 }}>Order items</label>
                    {orderForm.items.map((it, i) => (
                      <div key={i} className="order-line">
                        <div className="inv-field">
                          <label className="inv-label">Product</label>
                          <select value={it.product_id} onChange={(e) => setOrderForm({ ...orderForm, items: orderForm.items.map((x, j) => j === i ? { ...x, product_id: e.target.value } : x) })}>
                            <option value="">Select product…</option>
                            {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.category ? ' · ' + p.category : ''}{p.sku ? ' (' + p.sku + ')' : ''}, ₦{p.unit_price}</option>)}
                          </select>
                        </div>
                        <div className="inv-field" style={{ flex: '0 0 96px' }}>
                          <label className="inv-label">Quantity</label>
                          <input type="number" min="1" placeholder="Qty" value={it.qty} onChange={(e) => setOrderForm({ ...orderForm, items: orderForm.items.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x) })} />
                        </div>
                        <button className="btn-ghost sm remove-line" onClick={() => setOrderForm({ ...orderForm, items: orderForm.items.filter((_, j) => j !== i) })}>Remove</button>
                      </div>
                    ))}
                    <button className="btn-ghost sm" onClick={() => setOrderForm({ ...orderForm, items: [...orderForm.items, { product_id: '', qty: 1 }] })}>+ Add product</button>
                  </>
                ) : (
                  <div className="inv-field" style={{ marginTop: 10 }}>
                    <label className="inv-label">Describe the customised work in detail</label>
                    <textarea rows="3" placeholder="What exactly does the customer require? Include measurements, colours, delivery expectations, etc." value={orderForm.description || ''} onChange={(e) => setOrderForm({ ...orderForm, description: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--line)', fontFamily: 'inherit', fontSize: 14 }} />
                    <label className="inv-label" style={{ marginTop: 10 }}>Estimated value (₦, optional)</label>
                    <input type="number" min="0" placeholder="Leave blank if you'll agree the price later" value={orderForm.amount_ngn || ''} onChange={(e) => setOrderForm({ ...orderForm, amount_ngn: Number(e.target.value) })} />
                  </div>
                )}
                <div className="inv-item-row" style={{ marginTop: 10 }}>
                  <div className="inv-field">
                    <label className="inv-label">Payment terms</label>
                    <input placeholder="e.g. Half now, half on delivery" value={orderForm.payment_terms || ''} onChange={(e) => setOrderForm({ ...orderForm, payment_terms: e.target.value })} />
                  </div>
                </div>
                <div className="inv-item-row">
                  <div className="inv-field">
                    <label className="inv-label">Notes (delivery / instructions)</label>
                    <input placeholder="e.g. Deliver within 24 hours to the Lekki site" value={orderForm.note || ''} onChange={(e) => setOrderForm({ ...orderForm, note: e.target.value })} />
                  </div>
                </div>
                <div className="inv-item-row">
                  <button className="btn-primary sm" onClick={async () => {
                    try {
                      const body = { contact_id: Number(orderForm.contact_id), kind: orderForm.kind || 'catalog', note: orderForm.note, payment_terms: orderForm.payment_terms };
                      if ((orderForm.kind || 'catalog') === 'catalog') {
                        body.items = orderForm.items.filter((x) => x.product_id);
                      } else {
                        body.description = orderForm.description;
                        body.amount_ngn = orderForm.amount_ngn;
                      }
                      await api('/orders', { method: 'POST', body: JSON.stringify(body) });
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
                <div className="thread-ava"><Icon name="package" size={16} /></div>
                <div style={{ flex: 1 }}>
                  <div><b>Order #{o.id}</b>, {o.contact_name} {o.rep_name && <span className="muted">(rep: {o.rep_name})</span>}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {o.total_ngn.toLocaleString()} naira · {JSON.parse(o.items_json || '[]').map((x) => `${x.name} ×${x.qty}`).join(', ') || ', '}
                    {o.invoice_id && <> · <b>Invoice #{o.invoice_id}</b></>}
                    {o.payment_ref && <> · ref {o.payment_ref}</>}
                  </div>
                </div>
                <span className={`inv-tag ${o.status}`}>{o.status}</span>
                {opsMode && (
                  <div className="inv-actions-grid" style={{ marginTop: 0 }}>
                    {o.status === 'pending' && <button className="act-btn" onClick={async () => {
                      let finalPrice = null;
                      if (o.kind === 'custom') {
                        const entered = window.prompt(`Approve custom order #${o.id}. Set the final price (₦):`, o.total_ngn || 0);
                        if (entered === null) return;
                        const v = Number(entered);
                        if (!(v > 0)) { alert('Enter a valid price'); return; }
                        finalPrice = v;
                      }
                      await api(`/orders/${o.id}/approve`, { method: 'POST', body: JSON.stringify(finalPrice ? { final_total_ngn: finalPrice } : {}) });
                      setOrders((await api('/orders')).rows); setNotifs((await api('/notifications')).rows);
                    }}><span><Icon name="check" size={14} /></span>Approve</button>}
                    {o.status === 'pending' && <button className="act-btn" onClick={async () => { await api(`/orders/${o.id}/reject`, { method: 'POST' }); setOrders((await api('/orders')).rows); }}><span><Icon name="x" size={12} /></span>Reject</button>}
                    {o.status === 'approved' && <button className="act-btn" onClick={async () => { await api(`/orders/${o.id}/deliver`, { method: 'POST' }); setOrders((await api('/orders')).rows); setNotifs((await api('/notifications')).rows); }}><span><Icon name="truck" size={14} /></span>Delivered</button>}
                    {o.status === 'delivered' && <button className="act-btn" onClick={async () => { const ref = prompt('Payment reference (optional)') || null; await api(`/orders/${o.id}/payment`, { method: 'POST', body: JSON.stringify({ ref }) }); setOrders((await api('/orders')).rows); setNotifs((await api('/notifications')).rows); }}><span><Icon name="banknote" size={14} /></span>Post payment</button>}
                  </div>
                )}
              </div>
            ))}
            {orders.length === 0 && <p className="muted">No orders yet, raise one above and watch it move through approval → invoice → delivery → payment.</p>}
          </div>
        )}

        {view === 'mail' && (
          <div className="chat-shell">
            <div className="chat-sidebar">
              <div className="inv-head" style={{ padding: '10px 12px' }}>
                <h3 style={{ margin: 0 }}><Icon name="chat" size={14} /> Team Chat</h3>
                <button className="btn-primary sm" onClick={() => setDmPickerOpen(!dmPickerOpen)}>+ New</button>
              </div>
              {dmPickerOpen && (
                <div className="dm-picker">
                  <div className="mention-head">Start a conversation</div>
                  <div className="mention-item" onClick={() => { setDmPickerOpen(false); setChannelPickerOpen(true); }}>
                    <Icon name="user" size={14} /> New chat <span className="muted">, message one person</span>
                  </div>
                  <div className="mention-item" onClick={() => { setDmPickerOpen(false); setNewChannelOpen(true); }}>
                    # New channel <span className="muted">, group chat</span>
                  </div>
                </div>
              )}
              {channelPickerOpen && (
                <div className="dm-picker">
                  <div className="mention-head">New chat, pick a teammate</div>
                  {chatStaff.filter((s) => s.id !== jwtPayload()?.staff_id).map((s) => (
                    <div key={s.id} className="mention-item" onClick={async () => {
                      const r = await api('/chat/conversations', { method: 'POST', body: JSON.stringify({ kind: 'dm', with_staff_id: s.id }) });
                      setChatConvs((await api('/chat/conversations')).conversations);
                      setActiveConv(await api(`/chat/conversations/${r.id}`));
                      setChannelPickerOpen(false);
                    }}>
                      <div className="chat-contact">
                        <span className="thread-ava">{s.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}</span>
                        <span style={{ flex: 1 }}>
                          <b>{s.name}</b>
                          <div className="muted" style={{ fontSize: 12 }}>{s.role || 'Staff'} · {s.department}</div>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {newChannelOpen && (
                <div className="dm-picker">
                  <div className="mention-head">New channel</div>
                  <div className="mention-item" style={{ padding: 10 }}>
                    <input placeholder="Channel name (e.g. Procurement)" style={{ marginBottom: 8 }} onChange={(e) => { window.__channelName = e.target.value; }} />
                    <button className="btn-primary sm" onClick={async () => {
                      const title = window.__channelName;
                      if (!title) { alert('Enter a channel name'); return; }
                      const members = chatStaff.map((s) => s.id);
                      const r = await api('/chat/conversations', { method: 'POST', body: JSON.stringify({ kind: 'group', title, members }) });
                      setChatConvs((await api('/chat/conversations')).conversations);
                      setActiveConv(await api(`/chat/conversations/${r.id}`));
                      setNewChannelOpen(false);
                    }}>Create channel</button>
                  </div>
                </div>
              )}
              <div className="chat-section-head">Channels</div>
              {chatConvs.filter((c) => c.kind === 'group').map((c) => (
                <div key={c.id} className={`chat-item ${activeConv?.conversation?.id === c.id ? 'active' : ''}`} onClick={async () => {
                  const fresh = await api(`/chat/conversations/${c.id}`);
                  setActiveConv(fresh);
                  const last = fresh.messages.length ? fresh.messages[fresh.messages.length - 1].id : 0;
                  if (last) markConvSeen(c.id, last);
                }}>
                  <div className="thread-ava">#</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{c.title || 'Channel'}{c.dept && <span className="muted" style={{ fontSize: 11 }}> · {c.members.length} members</span>}</b>
                    {c.last && <div className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.last.sender_name ? c.last.sender_name.split(' ')[0] + ': ' : ''}{c.last.body}</div>}
                  </div>
                  {chatUnread[c.id] > 0 && <b className="unread-badge">{chatUnread[c.id]}</b>}
                </div>
              ))}
              <div className="chat-section-head">Direct messages</div>
              {chatConvs.filter((c) => c.kind === 'dm').map((c) => (
                <div key={c.id} className={`chat-item ${activeConv?.conversation?.id === c.id ? 'active' : ''}`} onClick={async () => {
                  const fresh = await api(`/chat/conversations/${c.id}`);
                  setActiveConv(fresh);
                  const last = fresh.messages.length ? fresh.messages[fresh.messages.length - 1].id : 0;
                  if (last) markConvSeen(c.id, last);
                }}>
                  <div className="thread-ava">{c.title ? c.title.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() : <Icon name="user" size={16} />}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{c.title || 'Direct message'}</b>
                    {c.last && <div className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.last.sender_name ? c.last.sender_name.split(' ')[0] + ': ' : ''}{c.last.body}</div>}
                  </div>
                  {chatUnread[c.id] > 0 && <b className="unread-badge">{chatUnread[c.id]}</b>}
                </div>
              ))}
              <div className="chat-section-head">Contacts</div>
              {chatStaff.filter((s) => s.id !== jwtPayload()?.staff_id).map((s) => (
                <div key={s.id} className="chat-item" onClick={async () => {
                  const r = await api('/chat/conversations', { method: 'POST', body: JSON.stringify({ kind: 'dm', with_staff_id: s.id }) });
                  setChatConvs((await api('/chat/conversations')).conversations);
                  const fresh = await api(`/chat/conversations/${r.id}`);
                  setActiveConv(fresh);
                  const last = fresh.messages.length ? fresh.messages[fresh.messages.length - 1].id : 0;
                  if (last) markConvSeen(r.id, last);
                }}>
                  <div className="thread-ava">{s.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{s.name}</b>
                    <div className="muted" style={{ fontSize: 12 }}>{s.role || 'Staff'}{s.department ? ' · ' + s.department : ''}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="chat-window">
              {activeConv ? (
                <>
                  <div className="chat-header">
                    <b>{activeConv.conversation.kind === 'dm' ? <><Icon name="user" size={14} /> {activeConv.conversation.title}</> : <># {activeConv.conversation.title || 'Channel'}</>}</b>
                    {activeConv.conversation.kind === 'group' && <span className="muted">{activeConv.conversation.members.length} members</span>}
                  </div>
                  <div className="chat-messages">
                    {activeConv.messages.map((m) => {
                      const myStaff = jwtPayload()?.staff_id;
                      const mine = myStaff ? m.sender_staff_id === myStaff : m.sender_staff_id === null;
                      return (
                        <div key={m.id} className={`bubble-row ${mine ? 'mine' : ''}`}>
                          <div className="bubble">
                            {!mine && <div className="bubble-sender">{m.sender_name || 'System'}</div>}
                            <div>{m.body}</div>
                          </div>
                        </div>
                      );
                    })}
                    {activeConv.messages.length === 0 && <p className="muted" style={{ padding: 16 }}>No messages yet, say hello</p>}
                  </div>
                  <div className="chat-composer">
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input
                        placeholder="Type a message… @ to mention"
                        value={chatDraft}
                        onChange={(e) => { setChatDraft(e.target.value); setChatMentionOpen(e.target.value.endsWith('@')); }}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter' && chatDraft.trim() && !chatMentionOpen) {
                            const body = chatDraft.replace(/@$/, '').trim();
                            await api(`/chat/conversations/${activeConv.conversation.id}/messages`, { method: 'POST', body: JSON.stringify({ body, mentions: chatMentioned, groups: chatGroups }) });
                            setChatDraft(''); setChatMentioned([]); setChatGroups([]);
                            setActiveConv(await api(`/chat/conversations/${activeConv.conversation.id}`));
                            setChatConvs((await api('/chat/conversations')).conversations);
                          }
                        }}
                      />
                      {chatMentionOpen && (
                        <div className="mention-pop" style={{ bottom: 44 }}>
                          <div className="mention-head">Tap to mention</div>
                          {['sales', 'support', 'inventory', 'hr', 'account'].map((g) => (
                            <div key={g} className="mention-item" onClick={() => { setChatGroups([...new Set([...chatGroups, g])]); setChatMentionOpen(false); setChatDraft((d) => d.replace(/@$/, '') + '@' + g + ' '); }}>
                              <Icon name="users" size={13} /> @{g} (whole team)
                            </div>
                          ))}
                          {chatStaff.map((s) => (
                            <div key={s.id} className="mention-item" onClick={() => { setChatMentioned([...new Set([...chatMentioned, s.id])]); setChatMentionOpen(false); setChatDraft((d) => d.replace(/@$/, '') + '@' + s.name.split(' ')[0] + ' '); }}>
                              {s.name} <span className="muted">· {s.department}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button className="btn-primary sm" onClick={async () => {
                      if (!chatDraft.trim()) return;
                      await api(`/chat/conversations/${activeConv.conversation.id}/messages`, { method: 'POST', body: JSON.stringify({ body: chatDraft.trim(), mentions: chatMentioned, groups: chatGroups }) });
                      setChatDraft(''); setChatMentioned([]); setChatGroups([]);
                      setActiveConv(await api(`/chat/conversations/${activeConv.conversation.id}`));
                      setChatConvs((await api('/chat/conversations')).conversations);
                    }}>Send</button>
                  </div>
                </>
              ) : (
                <div className="chat-empty">
                  <div style={{ fontSize: 40 }}><Icon name="chat" size={14} /></div>
                  <p className="muted">Select a conversation, or hit + New to DM a teammate.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'invoices' && (
          <div className="card">
            {invView === 'list' && (
              <>
                <div className="inv-head">
                  <h3><Icon name="receipt" size={14} /> Invoicing</h3>
                  {!isGuest && opsMode && <button className="btn-primary sm" onClick={newInvoice}>+ New Invoice</button>}
                  {!opsMode && <span className="muted" style={{ fontSize: 12 }}>Invoices are raised by admin/accounts, you raise orders.</span>}
                </div>
                <div className="kpis">
                  <div className="kpi"><div className="label">Receivables</div><div className="value">{fmt(receivables)}</div></div>
                  <div className="kpi"><div className="label">Overdue</div><div className="value">{invCounts.overdue || 0}</div></div>
                  <div className="kpi"><div className="label">Sent</div><div className="value">{invCounts.sent || 0}</div></div>
                  <div className="kpi"><div className="label">Paid</div><div className="value">{invCounts.paid || 0}</div></div>
                </div>
                {invoices.map((i) => (
                  <div key={i.id} className="inv-row" onClick={() => openInvoice(i)}>
                    <div className="thread-ava"><Icon name="receipt" size={14} /></div>
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
                  <p className="muted fx-hint">1 {newInv.currency} ≈ {fmt(fx.rates[newInv.currency])} · {fx.source === 'live' ? 'live rate' : 'offline rate'}, books stay in naira automatically</p>
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
                <h3><Icon name="pencil" size={14} /> Edit draft invoice {activeInv.number}</h3>
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
                  <button className="btn-ghost" onClick={() => setInvView('list')}><Icon name="chevL" size={12} /></button>
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
                  {!isGuest && opsMode && activeInv.status === 'draft' && <button className="btn-primary act-primary" onClick={sendInvoice}>Mark as sent</button>}
                  {!isGuest && opsMode && (activeInv.status === 'sent' || activeInv.status === 'overdue') && <button className="btn-primary act-primary" onClick={payInvoice}>Mark as paid <Icon name="check" size={14} /></button>}
                  <div className="inv-actions-grid">
                    {!isGuest && opsMode && activeInv.status !== 'paid' && (
                      <>
                        <button className="act-btn" onClick={shareWhatsApp}><span><Icon name="chat" size={14} /></span>WhatsApp</button>
                        <button className="act-btn" onClick={copyPayLink}><span><Icon name="link" size={14} /></span>Copy link</button>
                      </>
                    )}
                    <button className="act-btn" onClick={downloadPdf}><span>⬇️</span>PDF</button>
                    <button className="act-btn" onClick={emailInvoice}><span>✉️</span>Email</button>
                    {!isGuest && opsMode && activeInv.status === 'draft' && <button className="act-btn" onClick={() => openInvEdit(activeInv, invItems)}><span><Icon name="pencil" size={14} /></span>Edit</button>}
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
                <b>{f.company || f.name}</b>, {f.reason}
                <p>{f.draft}</p>
              </div>
            ))}
          </div>
        )}

        {view === 'feedback' && (
          <div className="card">
            <div className="inv-head"><h3><Icon name="file" size={14} /> Conversation Feedback</h3>{!isGuest && <button className="btn-primary sm" onClick={() => setFbOpen(!fbOpen)}>+ Add feedback</button>}</div>
            <p className="muted">Capture what customers said on calls and visits, the AI reports use it.</p>
            {fbOpen && (
              <>
                <label className="inv-label">Customer (optional)</label>
                <select value={fbForm.contact_id} onChange={(e) => setFbForm({ ...fbForm, contact_id: e.target.value })}>
                  <option value="">General</option>
                  {contacts.map((c) => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
                </select>
                <textarea
                  className="fb-area"
                  placeholder="e.g. Called GPFI procurement, they said management is reviewing the proposal this week…"
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
                  <button className="btn-ghost sm" onClick={() => deleteFeedback(f.id)}><Icon name="trash" size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {view === 'reports' && (
          <div className="card">
            <h3><Icon name="chart" size={14} /> AI Activity Report</h3>
            <div className="dept-pills">
              {[['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['biannual', 'Biannual'], ['year', 'Year-end']].map(([k, label]) => (
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
                <p className="muted">Generated {new Date(report.generated_at).toLocaleString()} · covers last {report.period === 'daily' ? '1 day' : report.period === 'weekly' ? '7 days' : report.period === 'monthly' ? '30 days' : report.period === 'quarterly' ? '90 days' : report.period === 'biannual' ? '182 days' : '365 days'}</p>
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

        {view === 'wallet' && (
          <div className="card">
            <div className="inv-head">
              <h3><Icon name="wallet" size={16} /> Wallet</h3>
              {walletData?.demo && <span className="chip draft">demo mode</span>}
            </div>
            <div className="kpis">
              <div className="kpi"><div className="label">Balance</div><div className="value">{fmt(walletData?.wallet?.balance_ngn || 0)}</div></div>
            </div>
            <div className="quick-actions" style={{ marginTop: 0 }}>
              {!isGuest && (
                <>
                  <button className="btn-primary sm" onClick={async () => {
                    const amt = window.prompt('Top-up amount (₦):');
                    if (!amt || !(Number(amt) > 0)) return;
                    await api('/wallet/topup', { method: 'POST', body: JSON.stringify({ amount_ngn: Number(amt), note: 'Top-up' }) });
                    setWalletData(await api('/wallet'));
                  }}><Icon name="down" size={13} /> Add money</button>
                  <button className="btn-ghost sm" onClick={async () => {
                    const amt = window.prompt('Payout amount (₦):');
                    if (!amt || !(Number(amt) > 0)) return;
                    const dest = window.prompt('Destination (bank / account):') || '';
                    try {
                      await api('/wallet/payout', { method: 'POST', body: JSON.stringify({ amount_ngn: Number(amt), destination: dest, note: 'Payout' }) });
                      setWalletData(await api('/wallet'));
                    } catch (e) { alert(e.message || 'Payout failed'); }
                  }}><Icon name="up" size={13} /> Send money out</button>
                </>
              )}
            </div>
            <h3 style={{ marginTop: 16 }}>Transactions</h3>
            {(walletData?.transactions || []).map((t) => (
              <div key={t.id} className="inv-row">
                <div className="thread-ava" style={{ background: t.direction === 'in' ? 'linear-gradient(135deg, #0b8f5c, #12b57b)' : 'linear-gradient(135deg, #8a5a44, #b06f52)' }}>
                  <Icon name={t.direction === 'in' ? 'down' : 'up'} size={15} />
                </div>
                <div className="thread-info">
                  <b>{t.kind === 'payment' ? 'Customer payment' : t.kind === 'topup' ? 'Top-up' : t.kind === 'payout' ? 'Payout' : 'Adjustment'}</b>
                  <span>{t.note}{t.ref_type && t.ref_id ? ` · ${t.ref_type} #${t.ref_id}` : ''} · {(t.created_at || '').slice(0, 16)}{t.by_name ? ' · ' + t.by_name : ''}</span>
                </div>
                <div className="inv-right">
                  <div className="inv-amt" style={{ color: t.direction === 'in' ? '#0b8f5c' : '#c0392b' }}>{t.direction === 'in' ? '+' : '−'}{fmt(t.amount_ngn)}</div>
                  {t.status === 'requested' && <span className="chip pending">requested</span>}
                </div>
              </div>
            ))}
            {(walletData?.transactions || []).length === 0 && <p className="muted">No money has moved yet. Customer payments land here automatically.</p>}
          </div>
        )}

        {view === 'portal' && portal && (
          <div className="card">
            <h3><Icon name="user" size={14} /> My Portal, {portal.staff.name}</h3>
            <div className="inv-line"><span>Role</span><span>{portal.staff.role} · {portal.staff.department}</span></div>
            <div className="inv-line"><span>Salary</span><span>{fmt(portal.staff.salary)}/mo</span></div>
            <div className="inv-line"><span>HMO</span><span>{portal.staff.hmo_plan || ', '}</span></div>
            <div className="inv-line"><span>Bank</span><span>{portal.staff.bank || ', '}</span></div>

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
                <button className="btn-primary" onClick={async () => { await api('/attendance/clock-out', { method: 'POST', body: '{}' }); setPortal(await api('/me/portal')); }}><Icon name="clock" size={14} /> Clock out</button>
              ) : null}
            </div>

            <h3 style={{ marginTop: 14 }}><Icon name="receipt" size={14} /> My payslips</h3>
            {portal.payslips.length === 0 && <p className="muted">No payslips yet.</p>}
            {portal.payslips.map((p) => (
              <div key={p.id} className="inv-row">
                <div className="thread-ava"><Icon name="receipt" size={14} /></div>
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
                  }}><Icon name="download" size={14} /> PDF</button>
                </div>
              </div>
            ))}

            <h3 style={{ marginTop: 14 }}><Icon name="banknote" size={14} /> My salary advances</h3>
            {portal.advances.length === 0 && <p className="muted">No advances requested.</p>}
            {portal.advances.map((a) => (
              <div key={a.id} className="inv-line">
                <span>{fmt(a.amount)}, {a.reason}</span>
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

            <h3 style={{ marginTop: 14 }}><Icon name="calendar" size={14} /> My leave</h3>
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

            <h3 style={{ marginTop: 14 }}><Icon name="calendar" size={14} /> My shifts (next 7 days)</h3>
            {portalShifts.length === 0 && <p className="muted">No shifts assigned yet.</p>}
            {portalShifts.map((sh) => (
              <div key={sh.id} className="inv-line">
                <span>{sh.date}</span>
                <span className="chip draft">{sh.shift}</span>
              </div>
            ))}

            <h3 style={{ marginTop: 14 }}><Icon name="banknote" size={14} /> My commissions</h3>
            {commissions.filter((c) => c.staff_id === jwtPayload()?.staff_id).map((c) => (
              <div key={c.staff_id}>
                <div className="inv-line"><span>Rate</span><span>{c.rate}%</span></div>
                <div className="inv-line"><span>This month ({c.period.paid_invoices} paid invoices · {fmt(c.period.sales_value)})</span><span className="inv-amt">{fmt(c.period.commission)}</span></div>
                <div className="inv-line"><span>All-time commission</span><span>{fmt(c.all_time.commission)}</span></div>
              </div>
            ))}
            {commissions.filter((c) => c.staff_id === jwtPayload()?.staff_id).length === 0 && <p className="muted">No commission data yet, your rate is set by HR.</p>}
          </div>
        )}

        {view === 'ads' && (
          <div className="card ads-card">
            <div className="ads-badge">COMING SOON</div>
            <h3><Icon name="megaphone" size={14} /> Ads Studio</h3>
            <p className="muted">Run Meta & Google ads the easy way, the AI plans, builds and optimises while you watch the returns.</p>
            <ul className="ads-list">
              <li><Icon name="sparkles" size={14} /> AI builds your ad copy, creative and audience, you just approve</li>
              <li><Icon name="card" size={14} /> One naira budget, all-in, our fee is a simple % of your ad spend</li>
              <li><Icon name="chart" size={14} /> Live analytics: spend, clicks, leads and ROI on every naira</li>
              <li><Icon name="sparkles" size={14} /> Weekly AI recommendations that shift budget to what sells</li>
            </ul>
            <button className="btn-primary" onClick={() => alert('Ads Studio is coming in the next build phase. You are first in line, Grant!')}>Join the waitlist</button>
          </div>
        )}
      </main>
    </div>
  );
}

function ReceiptThumb({ id, small }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch(API + '/receipts/' + id + '/image', { headers: { Authorization: 'Bearer ' + localStorage.getItem(tokenKey) } })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => { if (b && alive) setUrl(URL.createObjectURL(b)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [id]);
  if (!url) return null;
  return <img src={url} alt="receipt" style={{ height: small ? 44 : 120, borderRadius: 8, border: '1px solid var(--line)', cursor: 'zoom-in' }} onClick={(e) => { e.stopPropagation(); window.open(url, '_blank'); }} />;
}

function SuperAdminApp() {
  const [summary, setSummary] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [auditRows, setAuditRows] = useState([]);
  const [demoLinks, setDemoLinks] = useState([]);
  const [demoOrg, setDemoOrg] = useState('');
  const [demoLabel, setDemoLabel] = useState('');
  const [featureOrg, setFeatureOrg] = useState(null); // org id with the feature panel open
  const [loaded, setLoaded] = useState(false);
  const load = async () => {
    try {
      const [s, o, a, dl] = await Promise.all([api('/platform/summary'), api('/platform/orgs'), api('/platform/audit'), api('/platform/demo-links')]);
      setSummary(s); setOrgs(o.orgs || []); setAuditRows(a.rows || []); setDemoLinks(dl.links || []);
    } catch (e) { console.error(e); }
    setLoaded(true);
  };
  useEffect(() => { load(); }, []);
  const logout = () => { localStorage.removeItem(tokenKey); location.reload(); };
  const fmt = (n) => '₦' + Number(n || 0).toLocaleString();
  return (
    <div className="platform-shell">
      <header className="platform-top">
        <div className="logo"><div className="logo-mark">O</div><div><b>OmniCRM</b><span>platform console</span></div></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="chip closed">super admin</span>
          <button className="btn-ghost sm" onClick={load}>Refresh</button>
          <button className="btn-ghost sm" onClick={logout}><Icon name="logout" size={14} /> Log out</button>
        </div>
      </header>
      <main className="platform-main">
        <h1>Platform Console</h1>
        <p className="muted" style={{ textAlign: 'left' }}>You sit above every organization. Enter any org, reset passwords, control feature access. Every action is audit-logged.</p>
        {!loaded && <p className="muted">Loading organizations…</p>}
        {loaded && (
          <>
            <div className="kpis">
              <div className="kpi"><div className="label">Organizations</div><div className="value">{summary?.orgs ?? 0}</div></div>
              <div className="kpi"><div className="label">Staff members</div><div className="value">{summary?.staff ?? 0}</div></div>
              <div className="kpi"><div className="label">Contacts</div><div className="value">{summary?.contacts ?? 0}</div></div>
              <div className="kpi"><div className="label">Paid invoices</div><div className="value">{fmt(summary?.invoices_paid_value)}</div></div>
              <div className="kpi"><div className="label">Wallet balances</div><div className="value">{fmt(summary?.wallet_balances)}</div></div>
              <div className="kpi"><div className="label">AI calls today</div><div className="value">{summary?.ai_calls_today ?? 0}</div></div>
            </div>
            <div className="card">
              <h3><Icon name="building" size={15} /> Organizations</h3>
              {orgs.filter((o) => !o.is_guest).map((o) => (
                <div key={o.id}>
                  <div className="inv-row" style={{ gridTemplateColumns: '1fr auto' }}>
                    <div className="thread-info" style={{ paddingLeft: 8 }}>
                      <b>{o.business_name || o.email}</b>
                      <span>{o.email} · {o.staff} staff · {o.contacts} contacts · {o.invoices} invoices · joined {String(o.created_at || '').slice(0, 10)}</span>
                    </div>
                    <div className="inv-right" style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn-ghost sm" onClick={() => setFeatureOrg(featureOrg === o.id ? null : o.id)}>
                        <Icon name="settings" size={13} /> {featureOrg === o.id ? 'Close features' : 'Manage features'}
                      </button>
                      <button className="btn-ghost sm" onClick={async () => {
                        if (!window.confirm(`Sign in as ${o.business_name || o.email}? Your session switches to their account (2h). Audit logged.`)) return;
                        const r = await api('/platform/impersonate', { method: 'POST', body: JSON.stringify({ user_id: o.id }) });
                        localStorage.setItem(tokenKey, r.token);
                        location.reload();
                      }}><Icon name="right" size={13} /> Enter org</button>
                      <button className="btn-ghost sm" onClick={async () => {
                        const np = window.prompt(`New password for ${o.business_name || o.email} (min 8 chars):`);
                        if (!np) return;
                        await api(`/platform/orgs/${o.id}/password`, { method: 'POST', body: JSON.stringify({ new_password: np }) });
                        alert('Password reset and audit-logged.');
                      }}>Reset password</button>
                    </div>
                  </div>
                  {featureOrg === o.id && (
                    <div className="feat-panel">
                      <div className="feat-panel-head">
                        <b>Features for {o.business_name || o.email}</b>
                        <span className="quick-actions" style={{ marginTop: 0 }}>
                          <button className="btn-ghost sm" onClick={async () => {
                            const next = {};
                            for (const k of FEATURE_KEYS) next[k] = true;
                            await api(`/platform/orgs/${o.id}/features`, { method: 'PUT', body: JSON.stringify({ features: next }) });
                            await load();
                          }}>Enable all</button>
                          <button className="btn-ghost sm" onClick={async () => {
                            const next = {};
                            for (const k of FEATURE_KEYS) next[k] = false;
                            await api(`/platform/orgs/${o.id}/features`, { method: 'PUT', body: JSON.stringify({ features: next }) });
                            await load();
                          }}>Disable all</button>
                        </span>
                      </div>
                      {FEATURE_KEYS.map((k) => {
                        const cur = o.features || {};
                        const on = cur[k] !== false;
                        return (
                          <div key={k} className="feat-toggle">
                            <span>{k === 'inbox' ? 'WhatsApp Inbox' : k.replace(/_/g, ' ')}</span>
                            <label className="switch">
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={async (e) => {
                                  const next = { ...cur, [k]: !on };
                                  await api(`/platform/orgs/${o.id}/features`, { method: 'PUT', body: JSON.stringify({ features: next }) });
                                  await load();
                                }}
                              />
                              <span className="slider" />
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="card">
              <h3><Icon name="link" size={15} /> Demo links (shareable, revocable)</h3>
              <p className="muted" style={{ textAlign: 'left' }}>Create guest demo links for any organization. Revoke any link and it stops working instantly.</p>
              <div className="inv-item-row" style={{ alignItems: 'flex-end' }}>
                <div className="inv-field" style={{ maxWidth: 260 }}>
                  <label className="inv-label" style={{ marginTop: 0 }}>Organization</label>
                  <select value={demoOrg} onChange={(e) => setDemoOrg(e.target.value)}>
                    <option value="">Pick organization…</option>
                    {orgs.map((o) => <option key={o.id} value={o.id}>{o.business_name || o.email}</option>)}
                  </select>
                </div>
                <div className="inv-field">
                  <label className="inv-label" style={{ marginTop: 0 }}>Label (optional)</label>
                  <input placeholder="e.g. Investor pitch" value={demoLabel} onChange={(e) => setDemoLabel(e.target.value)} />
                </div>
                <button className="btn-primary sm" onClick={async () => {
                  if (!demoOrg) { alert('Pick an organization first'); return; }
                  const r = await api('/platform/demo-links', { method: 'POST', body: JSON.stringify({ user_id: Number(demoOrg), label: demoLabel }) });
                  setDemoLabel('');
                  await load();
                  window.prompt('Demo link (copy for sharing):', `${window.location.origin}${r.url}`);
                }}><Icon name="plus" size={13} /> Create demo link</button>
              </div>
              {demoLinks.length === 0 && <p className="muted">No demo links yet.</p>}
              {demoLinks.map((l) => (
                <div key={l.id} className="inv-line" style={{ marginTop: 8 }}>
                  <span><b>{l.business_name || l.email}</b> · {l.label || 'no label'} · <span className="muted">{l.active ? 'active' : 'revoked'} · {String(l.created_at || '').slice(0, 10)}</span></span>
                  <span style={{ display: 'flex', gap: 6 }}>
                    {l.active === 1 && <button className="btn-ghost sm" onClick={() => window.prompt('Demo link:', `${window.location.origin}/demo.html?token=${l.token}`)}>Copy link</button>}
                    {l.active === 1 && <button className="btn-ghost sm" style={{ color: '#c0392b' }} onClick={async () => {
                      if (!window.confirm('Revoke this link? Anyone holding it loses access instantly.')) return;
                      await api(`/platform/demo-links/${l.id}/revoke`, { method: 'POST' });
                      await load();
                    }}>Revoke</button>}
                    {l.active !== 1 && <span className="chip low">revoked</span>}
                  </span>
                </div>
              ))}
            </div>
            <div className="card">
              <h3><Icon name="shield" size={15} /> Audit trail</h3>
              {auditRows.length === 0 && <p className="muted">No platform actions recorded yet.</p>}
              {auditRows.map((a) => (
                <div key={a.id} className="inv-line">
                  <span>{a.action} · {a.detail || ''}</span>
                  <span className="muted">{(a.created_at || '').slice(0, 16)} · {a.admin_email}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Landing({ onLogin, onStart, theme, onToggleTheme }) {
  const features = [
    ['trend', 'Sales CRM', 'Pipeline, follow-ups and AI-drafted messages that close deals while you sleep.'],
    ['chat', 'WhatsApp AI Inbox', 'One inbox for every customer chat, the AI drafts, you approve and send.'],
    ['package', 'Inventory', 'Stock levels, low-stock alerts and stock value, updated in real time.'],
    ['receipt', 'Invoicing', 'Send invoices from your phone, track payments, chase debtors politely.'],
    ['megaphone', 'Ads Studio', 'AI-run Meta & Google ads with live ROI analytics, pay only a % of ad spend.'],
    ['buoy', 'Support Desk', 'Every complaint becomes a ticket with priority, SLA and history.'],
  ];
  const cats = [
    ['building', 'Nano & Micro', 'Corner shops, side hustles, digital tools at naira prices, nothing to learn.'],
    ['card', 'Small Business', 'Retailers, salons, pharmacies, run sales, stock and WhatsApp in one app.'],
    ['globe', 'Medium & Enterprise', 'Facility managers, distributors, franchises, dashboards for every department.'],
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
        <button className="icon-btn" onClick={onToggleTheme} aria-label="Toggle dark mode" title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
        </button>
      </header>

      <section className="hero">
        {sessionStorage.getItem('omnicrm_demo') && (
          <div className="demo-banner">
            You're in a read-only guest demo, log in with <b>guest@omnicrm.ng</b> / <b>guest-demo</b> to explore. Changes are disabled.
          </div>
        )}
        <h1>Every business tool your company needs.<br />One app. One naira at a time.</h1>
        <p className="hero-sub">OmniCRM digitalises how nano, micro, small and enterprise businesses sell, support, stock and advertise, with AI doing the heavy lifting.</p>
        <div className="hero-cta">
          <button className="btn-primary big" onClick={onStart}>Start free</button>
          <a className="btn-ghost big" href="#pricing">See pricing</a>
        </div>
      </section>

      <section id="features" className="landing-section">
        <h2>Everything large retailers have, for everyone else</h2>
        <div className="feat-grid">
          {features.map(([icon, title, desc]) => (
            <div key={title} className="feat">
              <div className="feat-icon"><Icon name={icon} size={20} /></div>
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
              <div className="feat-icon"><Icon name={icon} size={20} /></div>
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
                {perks.map((p) => <li key={p}><Icon name="check" size={14} /> {p}</li>)}
              </ul>
              <button className={name === 'Pro' ? 'btn-primary' : 'btn-ghost'} onClick={onStart}>{cta}</button>
            </div>
          ))}
        </div>
        <p className="muted pricing-note">Ads Studio: no fixed fee, you pay a simple percentage of ad spend, and every campaign reports its ROI.</p>
      </section>

      <footer className="landing-footer">
        <div className="logo"><div className="logo-mark">O</div><div><b>OmniCRM</b><span>beta</span></div></div>
        <p className="muted">Made for Nigerian businesses · Lagos, Nigeria</p>
        <p className="muted">© 2026 OmniCRM · <a href="/privacy.html" style={{ color: 'inherit' }}>Privacy & AI Disclosure</a></p>
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
              {showPw ? <Icon name="eyeOff" size={15} /> : <Icon name="eye" size={15} />}
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
          : 'Demo: grant@omnicrm.com / omnicrm-demo'}</p>
      </div>
    </div>
  );
}
