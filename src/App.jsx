import { useEffect, useState, useCallback } from 'react';
import { supabase, api } from './api';

const money = (n) => '₦' + Number(n).toLocaleString();
const LABEL = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', needs_review: 'In review' };
const FLAGS = { OUTSIDE_REFUND_WINDOW: 'Outside 30-day window', EXCEEDS_REMAINING_BALANCE: 'Exceeds remaining balance', ORDER_NOT_DELIVERED: 'Order not delivered' };
const Pill = ({ s }) => <span className={`pill ${s}`}>{LABEL[s]}</span>;

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
  return (
    <div className="shell">
      <aside><h1 className="mark sm">Workon</h1>
        <div className="who"><b>{admin ? 'Support desk' : 'My orders'}</b><span>{me.email}</span></div>
        <button className="link light" onClick={() => supabase.auth.signOut()}>Sign out</button></aside>
      <main>{admin ? <Admin /> : <Customer />}</main>
    </div>
  );
}

function Drawer({ open, onClose, title, children }) {
  return (<>
    <div className={`scrim ${open ? 'on' : ''}`} onClick={onClose} />
    <section className={`drawer ${open ? 'on' : ''}`} aria-hidden={!open}><header><h3>{title}</h3><button className="x" onClick={onClose} aria-label="Close">×</button></header>{open && children}</section>
  </>);
}

function Customer() {
  const [orders, setOrders] = useState([]), [refunds, setRefunds] = useState([]), [sel, setSel] = useState(null);
  const load = useCallback(() => { api('/orders').then(setOrders); api('/refunds').then(setRefunds); }, []);
  useEffect(load, [load]);
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

function Admin() {
  const [items, setItems] = useState([]), [tab, setTab] = useState('needs_review'), [sel, setSel] = useState(null), [note, setNote] = useState(''), [err, setErr] = useState('');
  const load = useCallback(() => api('/admin/refunds').then(setItems), []);
  useEffect(() => { load(); }, [load]);
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
