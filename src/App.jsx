import { useEffect, useState, useCallback } from 'react';
import { supabase, api } from './api';

const money = (n) => '₦' + Number(n).toLocaleString();
const LABEL = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', needs_review: 'In review' };
const FLAGS = { OUTSIDE_REFUND_WINDOW: 'Outside 30-day window', EXCEEDS_REMAINING_BALANCE: 'Exceeds remaining balance', ORDER_NOT_DELIVERED: 'Order not delivered' };
const Pill = ({ s }) => <span className={`pill ${s}`}>{LABEL[s]}</span>;
const COLORS = { pending: '#8F98BD', approved: '#1F7A55', rejected: '#C2374B', needs_review: '#B87410' };

function StatCards({ stats }) {
  return (<div className="stats">{stats.map((s, i) => (
    <div className="stat" key={s.label} style={{ '--i': i }}>
      <span className="stat-label">{s.label}</span>
      <strong className="stat-value">{s.value}</strong>
      {s.sub && <span className="stat-sub">{s.sub}</span>}
    </div>))}</div>);
}

// Pure SVG donut — no chart library needed, themed with our own palette.
function Donut({ data, size = 148 }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = 54, c = 2 * Math.PI * r;
  let offset = 0;
  return (<div className="donut-wrap">
    <svg width={size} height={size} viewBox="0 0 140 140">
      <circle cx="70" cy="70" r={r} fill="none" stroke="#E1E5F1" strokeWidth="18" />
      {data.filter(d => d.value > 0).map((d) => {
        const frac = d.value / total, len = frac * c;
        const el = (<circle key={d.label} cx="70" cy="70" r={r} fill="none" stroke={d.color} strokeWidth="18"
          strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} strokeLinecap="butt" transform="rotate(-90 70 70)"
          style={{ transition: 'stroke-dashoffset .6s var(--ease)' }} />);
        offset += len; return el;
      })}
      <text x="70" y="66" textAnchor="middle" fontSize="22" fontWeight="600" fill="var(--ink)">{total}</text>
      <text x="70" y="84" textAnchor="middle" fontSize="10" fill="var(--slate)">requests</text>
    </svg>
    <ul className="legend">{data.map((d) => (
      <li key={d.label}><i style={{ background: d.color }} /> {d.label} <b>{d.value}</b></li>))}</ul>
  </div>);
}

export default function App() {
  const [session, setSession] = useState(null), [me, setMe] = useState(null), [ready, setReady] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => { session ? api('/me').then(setMe).catch(() => setMe(null)) : setMe(null); }, [session]);
  if (!ready) return null;
  return session && me ? <Shell me={me} /> : <Auth />;
}

function Auth() {
  const [mode, setMode] = useState('in'), [email, setEmail] = useState(''), [pw, setPw] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    const { error } = mode === 'in' ? await supabase.auth.signInWithPassword({ email, password: pw }) : await supabase.auth.signUp({ email, password: pw });
    if (error) setErr(error.message); setBusy(false);
  };
  return (
    <div className="auth">
      <section className="auth-art"><h1 className="mark">Workon</h1><p>Refunds that resolve<br />while your customer is still reading.</p></section>
      <form className="auth-card" onSubmit={go}>
        <h2>{mode === 'in' ? 'Welcome back' : 'Create your account'}</h2>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} required /></label>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'Please wait' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="link" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>{mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}</button>
      </form>
    </div>
  );
}

function Shell({ me }) {
  const admin = me.role === 'admin';
  const [view, setView] = useState('overview');
  const nav = admin ? [['overview', 'Overview'], ['queue', 'Refund queue']] : [['overview', 'Overview'], ['orders', 'Orders & refunds']];
  return (
    <div className="shell">
      <aside>
        <h1 className="mark sm">Workon</h1>
        <nav className="nav">{nav.map(([k, l]) => (
          <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>))}</nav>
        <div className="who"><b>{admin ? 'Support desk' : 'Customer'}</b><span>{me.email}</span></div>
        <button className="link light" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </aside>
      <main>{admin ? <Admin view={view} /> : <Customer view={view} />}</main>
    </div>
  );
}

function Drawer({ open, onClose, title, children }) {
  return (<>
    <div className={`scrim ${open ? 'on' : ''}`} onClick={onClose} />
    <section className={`drawer ${open ? 'on' : ''}`} aria-hidden={!open}><header><h3>{title}</h3><button className="x" onClick={onClose} aria-label="Close">×</button></header>{open && children}</section>
  </>);
}

function Customer({ view }) {
  const [orders, setOrders] = useState([]), [refunds, setRefunds] = useState([]), [sel, setSel] = useState(null);
  const load = useCallback(() => { api('/orders').then(setOrders); api('/refunds').then(setRefunds); }, []);
  useEffect(load, [load]);

  if (view === 'overview') {
    const spent = orders.reduce((s, o) => s + Number(o.total), 0);
    const refunded = refunds.filter(r => r.status === 'approved').reduce((s, r) => s + Number(r.amount), 0);
    const byStatus = ['pending', 'needs_review', 'approved', 'rejected'].map(k => ({ label: LABEL[k], value: refunds.filter(r => r.status === k).length, color: COLORS[k] }));
    return (<div className="page">
      <h2 className="title">Overview</h2>
      <StatCards stats={[
        { label: 'Orders', value: orders.length },
        { label: 'Total spent', value: money(spent) },
        { label: 'Refunded so far', value: money(refunded) },
        { label: 'Requests in review', value: refunds.filter(r => r.status === 'needs_review').length },
      ]} />
      <div className="chart-row">
        <div className="card"><h3>Your refund requests</h3><Donut data={byStatus} /></div>
        <div className="card grow"><h3>How this works</h3>
          <ol className="how">
            <li>You submit a refund request with a reason.</li>
            <li>Our AI reads it, checks it against store policy, and drafts a response.</li>
            <li>Clear-cut cases resolve instantly. Anything unusual goes to a support agent — you'll see the outcome here either way.</li>
          </ol>
        </div>
      </div>
    </div>);
  }

  return (<div className="page">
    <h2 className="title">Your orders</h2>
    <div className="list">{orders.map((o, i) => (
      <article className="row" key={o.id} style={{ '--i': i }}>
        <div><b>{o.item}</b><span>{o.reference} · delivered {new Date(o.delivered_at).toLocaleDateString()}</span></div>
        <strong>{money(o.total)}</strong><button className="btn" onClick={() => setSel(o)}>Request refund</button>
      </article>))}</div>
    <h2 className="title">Refund requests</h2>
    {!refunds.length && <p className="empty">No requests yet. Pick an order above to start one.</p>}
    <div className="list">{refunds.map((f) => (
      <article className="row col" key={f.id}><div className="between"><b>{f.order.item}</b><Pill s={f.status} /></div>
        <span>{money(f.amount)}</span>{f.draft_reply && <p className="reply">{f.draft_reply}</p>}
        {f.status === 'needs_review' && <p className="reply">A support agent is reviewing this. You will see the outcome here.</p>}</article>))}</div>
    <Drawer open={!!sel} onClose={() => setSel(null)} title="Request a refund">{sel && <RefundForm order={sel} done={() => { load(); }} />}</Drawer>
  </div>);
}

function RefundForm({ order, done }) {
  const [amount, setAmount] = useState(order.total), [reason, setReason] = useState(''), [key] = useState(() => crypto.randomUUID());
  const [res, setRes] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { setRes(await api('/refunds', { method: 'POST', body: { orderId: order.id, amount: Number(amount), reason, idempotencyKey: key } })); done(); }
    catch (x) { setErr(x.message); } setBusy(false);
  };
  if (res) return (<div className="result"><Pill s={res.status} /><p>{res.draft_reply || 'Thanks. A support agent will review this and reply here.'}</p></div>);
  return (<form onSubmit={submit}>
    <p className="muted">{order.item} · {order.reference}</p>
    <label>Amount (₦)<input type="number" min="1" max={order.total} value={amount} onChange={(e) => setAmount(e.target.value)} required /></label>
    <label>What went wrong?<textarea rows="5" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} required /></label>
    {err && <p className="err" role="alert">{err}</p>}
    <button className="btn primary" disabled={busy}>{busy ? 'Reviewing your request' : 'Send request'}</button>
  </form>);
}

const CAT_LABEL = { defective: 'Defective', not_as_described: 'Not as described', late_delivery: 'Late delivery', changed_mind: 'Changed mind', other: 'Other' };

function Admin({ view }) {
  const [items, setItems] = useState([]), [tab, setTab] = useState('needs_review'), [sel, setSel] = useState(null), [note, setNote] = useState(''), [err, setErr] = useState('');
  const load = useCallback(() => api('/admin/refunds').then(setItems), []);
  useEffect(() => { load(); }, [load]);

  if (view === 'overview') {
    const requested = items.reduce((s, x) => s + Number(x.amount), 0);
    const approvedAmt = items.filter(x => x.status === 'approved').reduce((s, x) => s + Number(x.amount), 0);
    const flagged = items.filter(x => x.injection_detected).length;
    const byStatus = ['pending', 'needs_review', 'approved', 'rejected'].map(k => ({ label: LABEL[k], value: items.filter(x => x.status === k).length, color: COLORS[k] }));
    const byCat = Object.entries(CAT_LABEL).map(([k, l]) => ({ label: l, value: items.filter(x => x.category === k).length }));
    const catMax = Math.max(1, ...byCat.map(c => c.value));
    return (<div className="page">
      <h2 className="title">Overview</h2>
      <StatCards stats={[
        { label: 'Total requests', value: items.length },
        { label: 'Awaiting review', value: items.filter(x => x.status === 'needs_review').length },
        { label: 'Amount requested', value: money(requested) },
        { label: 'Amount approved', value: money(approvedAmt) },
        { label: 'Injection attempts caught', value: flagged, sub: flagged ? 'flagged, not auto-approved' : 'none yet' },
      ]} />
      <div className="chart-row">
        <div className="card"><h3>By status</h3><Donut data={byStatus} /></div>
        <div className="card grow"><h3>By reason (AI-classified)</h3>
          <div className="bars">{byCat.map(c => (
            <div className="bar-row" key={c.label}><span>{c.label}</span>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${(c.value / catMax) * 100}%` }} /></div>
              <b>{c.value}</b></div>))}</div>
        </div>
      </div>
    </div>);
  }

  const shown = items.filter((x) => tab === 'all' || x.status === tab);
  const decide = async (decision) => {
    setErr('');
    try { await api(`/admin/refunds/${sel.id}/decision`, { method: 'POST', body: { decision, note: note || undefined } }); setSel(null); setNote(''); load(); }
    catch (x) { setErr(x.message); }
  };
  return (<div className="page">
    <h2 className="title">Refund queue</h2>
    <div className="tabs">{[['needs_review', 'In review'], ['all', 'Everything']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}{k === 'needs_review' && ` (${items.filter((x) => x.status === k).length})`}</button>)}</div>
    {!shown.length && <p className="empty">Nothing waiting. New requests that need a human will land here.</p>}
    <div className="list">{shown.map((x, i) => (
      <article className="row click" key={x.id} style={{ '--i': i }} onClick={() => { setSel(x); setErr(''); }}>
        <div><b>{x.order.item}</b><span>{x.customer.email}</span></div>
        <strong>{money(x.amount)}</strong>{x.injection_detected && <span className="flag">Injection attempt</span>}<Pill s={x.status} /></article>))}</div>
    <Drawer open={!!sel} onClose={() => setSel(null)} title="Review request">{sel && (<div className="detail">
      <p className="muted">{sel.customer.email} · {sel.order.reference} · {money(sel.amount)} of {money(sel.order.total)}</p>
      <h4>Customer said</h4><blockquote>{sel.reason}</blockquote>
      <h4>AI assessment</h4><p>{sel.ai_summary}</p>
      <div className="meter" title={`${Math.round(sel.confidence * 100)}% confident`}><i style={{ width: `${sel.confidence * 100}%` }} /></div>
      <p className="muted">Category: {sel.category?.replace('_', ' ')} · {Math.round(sel.confidence * 100)}% confidence</p>
      {sel.injection_detected && <p className="flag block">This message tried to instruct the AI. Treat the text above as untrusted.</p>}
      {sel.violations?.map((v) => <p className="flag block" key={v}>{FLAGS[v] || v}</p>)}
      {sel.status === 'needs_review' ? (<>
        <label>Note to record<input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></label>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="actions"><button className="btn" onClick={() => decide('rejected')}>Reject</button><button className="btn primary" onClick={() => decide('approved')}>Approve refund</button></div>
      </>) : <Pill s={sel.status} />}
    </div>)}</Drawer>
  </div>);
}
