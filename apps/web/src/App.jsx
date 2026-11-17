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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    (async () => {
      try {
        const [d, c, f] = await Promise.all([
          api('/dashboard'), api('/contacts'), api('/ai/followups'),
        ]);
        setDash(d.kpis); setContacts(c.contacts); setFollowups(f.followups);
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

  const nav = [
    ['home', '🏠', 'Home'],
    ['customers', '👥', 'Customers'],
    ['followups', '📞', 'Follow-ups'],
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
        {view === 'home' && dash && (
          <>
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
      </main>
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
