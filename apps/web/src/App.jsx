import React, { useEffect, useState } from 'react';

const API = '/api';
const tokenKey = 'omnicrm_token';

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = localStorage.getItem(tokenKey);
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(tokenKey));
  const [view, setView] = useState('home');
  const [dash, setDash] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [threads, setThreads] = useState([]);
  const [activeContact, setActiveContact] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [draft, setDraft] = useState('');
  const [composer, setComposer] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    (async () => {
      try {
        const [d, c, f, t] = await Promise.all([
          api('/dashboard'), api('/contacts'), api('/ai/followups'), api('/inbox'),
        ]);
        setDash(d.kpis); setContacts(c.contacts); setFollowups(f.followups); setThreads(t.threads);
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
    setToken(d.token);
  };
  const register = async (email, password, name, business_name) => {
    const d = await api('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, name, business_name }) });
    localStorage.setItem(tokenKey, d.token);
    setToken(d.token);
  };
  const logout = () => { localStorage.removeItem(tokenKey); setToken(null); setDash(null); setContacts([]); };

  const fmt = (n) => '₦' + Number(n).toLocaleString();

  if (loading) return <div className="center">Loading…</div>;

  if (!token) return <Login onLogin={login} onRegister={register} />;

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

  const nav = [
    ['home', '🏠', 'Home'],
    ['customers', '👥', 'Customers'],
    ['inbox', '💬', 'Inbox'],
    ['followups', '📞', 'Follow-ups'],
    ['ads', '📣', 'Ads Studio'],
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
        {view === 'home' && dash && (          <>
            <h1>Good morning 👋</h1>
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

function Login({ onLogin, onRegister }) {
  const [mode, setMode] = useState('login');
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
        <p className="muted switch" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'New here? Create an account' : 'Have an account? Log in'}
        </p>
        <p className="muted demo">Demo: grant@besconpaints.com / omnicrm-demo</p>
      </div>
    </div>
  );
}
