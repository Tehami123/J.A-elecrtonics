'use client';

import {useEffect,useState} from 'react';
import {BookOpen,Printer,Share2,X} from 'lucide-react';
import {exportRows} from '@/lib/export';
import {formatPKR as money} from '@/lib/currency';
import {fetchApi,fetchCachedJson,readCachedJson} from '@/lib/client-cache';

const dateText=value=>new Date(value).toLocaleDateString('en-PK');

export default function Ledger({locations,canExport}){
  const [id,setId]=useState('');
  const [ledger,setLedger]=useState(null);
  const [error,setError]=useState('');
  const [amount,setAmount]=useState('');
  const [method,setMethod]=useState('Cash');
  const [chequeNumber,setChequeNumber]=useState('');
  const [description,setDescription]=useState('');
  const [location,setLocation]=useState('');
  const [busy,setBusy]=useState(false);
  const [paymentOpen,setPaymentOpen]=useState(false);

  async function load(partyId){
    const url='/api/ledger?partyId='+encodeURIComponent(partyId);
    const cached=readCachedJson(url);
    if(cached)setLedger(cached);
    try{
      setLedger(await fetchCachedJson(url));
      setError('');
    }catch(e){
      setError(e.message);
    }
  }

  useEffect(()=>{
    const partyId=new URLSearchParams(window.location.search).get('id');
    if(partyId){
      setId(partyId);
      load(partyId);
    }else{
      setError('Select a party from the directory.');
    }
    const revalidate=()=>{
      if(document.visibilityState==='visible'&&partyId)load(partyId);
    };
    window.addEventListener('focus',revalidate);
    document.addEventListener('visibilitychange',revalidate);
    return()=>{
      window.removeEventListener('focus',revalidate);
      document.removeEventListener('visibilitychange',revalidate);
    };
  },[]);

  useEffect(()=>{
    if(!location){
      const defaultLocation=locations.find(x=>x.isDefault&&x.status==='Active')||locations.find(x=>x.status==='Active');
      if(defaultLocation)setLocation(defaultLocation._id);
    }
  },[locations,location]);

  async function submitPayment(event){
    event.preventDefault();
    if(!ledger)return;
    setBusy(true);
    setError('');
    try{
      const value=Number(amount);
      if(!Number.isFinite(value)||value<=0||value>ledger.party.balance){
        throw Error('Enter a payment amount within the outstanding balance.');
      }
      if(!location)throw Error('Select an active location.');
      if(method==='Cheque'&&!chequeNumber.trim())throw Error('Enter the cheque number.');
      const paymentSplits={cash:0,bank:0,cheque:0};
      if(method==='Cash')paymentSplits.cash=value;
      if(method==='Bank Transfer')paymentSplits.bank=value;
      if(method==='Cheque')paymentSplits.cheque=value;
      const response=await fetchApi('/api/transactions',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          type:ledger.party.partyType==='Customer'?'Payment Received':'Payment Paid',
          partyId:id,
          locationId:location,
          netTotal:value,
          paymentSplits,
          paymentMethod:method,
          chequeNumber:method==='Cheque'?chequeNumber.trim():undefined,
          description:description.trim()||`${method} settlement`,
          items:[],
        }),
      });
      const data=await response.json();
      if(!response.ok)throw Error(data.error||'Unable to record payment.');
      setAmount('');
      setChequeNumber('');
      setDescription('');
      setPaymentOpen(false);
      await load(id);
    }catch(e){
      setError(e.message);
    }finally{
      setBusy(false);
    }
  }

  function shareStatement(){
    if(!ledger)return;
    const isSupplier=ledger.party.partyType==='Supplier';
    const lines=[
      'J.A Electronics — Party Statement',
      `Party: ${ledger.party.name} (${ledger.party.partyType})`,
      `${isSupplier?'Payable':'Receivable'} balance: ${money(ledger.party.balance)}`,
      '',
      ...ledger.entries.map(entry=>[
        dateText(entry.date),
        entry.billNumber,
        entry.description,
        `Dr ${money(entry.debit)}`,
        `Cr ${money(entry.credit)}`,
        `Balance ${money(entry.running)}`,
      ].join(' | ')),
    ];
    const phone=String(ledger.party.phone||'').replace(/\D/g,'').replace(/^0/,'92');
    const recipient=phone?`/${phone}`:'';
    window.open(`https://wa.me${recipient}?text=${encodeURIComponent(lines.join('\n'))}`,'_blank','noopener,noreferrer');
  }

  const isSupplier=ledger?.party?.partyType==='Supplier';
  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow">PARTY ACCOUNTS</div>
        <h1>{ledger?.party?.name||'Party ledger'}</h1>
        <p>Chronological bills, settlements, and running outstanding balance.</p>
      </div>
      <div className="heading-actions">
        <a href="/parties" className="button secondary">Back to parties</a>
        {ledger&&<button className="button primary" onClick={()=>setPaymentOpen(true)}>Record payment / Settle balance</button>}
        {ledger&&<button className="button secondary" onClick={shareStatement}><Share2 size={16}/> WhatsApp statement</button>}
        {canExport&&ledger&&<>
          {['csv','xlsx'].map(format=><button key={format} className="button secondary" onClick={()=>exportRows(
            'party-ledger',
            ['Date','Reference','Description','Type','Debit','Credit','Balance'],
            ledger.entries.map(entry=>[dateText(entry.date),entry.billNumber,entry.description,entry.type,entry.debit,entry.credit,entry.running]),
            format,
          )}>{format==='csv'?'CSV':'Excel'}</button>)}
          <button className="button secondary" onClick={()=>window.print()}><Printer size={16}/> Print / PDF</button>
        </>}
      </div>
    </div>
    {error&&<div className="error" role="alert">{error}<button onClick={()=>setError('')} aria-label="Dismiss error"><X size={15}/></button></div>}
    {ledger&&<>
      <div className="stats-grid">
        <div className="stat card">
          <div className="stat-top"><span>Current {isSupplier?'payable':'receivable'}</span></div>
          <strong>{money(ledger.party.balance)}</strong>
          <div className="stat-note">{ledger.party.partyType} balance</div>
        </div>
        {!isSupplier&&<div className="stat card">
          <div className="stat-top"><span>Credit limit</span></div>
          <strong>{ledger.party.creditLimit==null?'Unlimited':money(ledger.party.creditLimit)}</strong>
        </div>}
      </div>
      <section className="card records">
        <div className="card-head">
          <div><h2>Ledger statement</h2><p>{ledger.entries.length} entries · Debits {isSupplier?'reduce':'increase'} outstanding; credits {isSupplier?'increase':'reduce'} outstanding.</p></div>
          <BookOpen size={18}/>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr>{['DATE','BILL / REFERENCE','DESCRIPTION','TYPE','DEBIT','CREDIT','RUNNING BALANCE'].map(label=><th key={label}>{label}</th>)}</tr></thead>
            <tbody>{ledger.entries.map(entry=><tr key={entry._id}>
              <td>{dateText(entry.date)}</td>
              <td className="strong">{entry.billNumber}</td>
              <td>{entry.description||entry.notes||entry.type}{entry.chequeNumber&&<small className="subline">Cheque {entry.chequeNumber}</small>}</td>
              <td>{entry.type}{entry.paymentMethod&&<small className="subline">{entry.paymentMethod}</small>}</td>
              <td>{money(entry.debit)}</td>
              <td>{money(entry.credit)}</td>
              <td>{money(entry.running)}</td>
            </tr>)}</tbody>
          </table>
          {!ledger.entries.length&&<div className="empty"><BookOpen size={20}/><strong>No transactions yet</strong><span>Purchases, sales, and payments will appear in this statement.</span></div>}
        </div>
        <p className="hr-note" style={{padding:'0 20px'}}>Running balances are reconstructed from recorded transactions. Reconcile opening balances and historical entries before relying on imported history.</p>
      </section>
    </>}
    {paymentOpen&&ledger&&<div className="overlay" onClick={()=>!busy&&setPaymentOpen(false)}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="settlement-title" onClick={event=>event.stopPropagation()}>
        <div className="modal-head">
          <div><h2 id="settlement-title">Record payment / settle balance</h2><p>{isSupplier?'Payment to supplier':'Payment received from customer'} · Balance {money(ledger.party.balance)}</p></div>
          <button className="icon-btn" aria-label="Close settlement" disabled={busy} onClick={()=>setPaymentOpen(false)}><X size={18}/></button>
        </div>
        <form onSubmit={submitPayment}>
          <div className="form-grid">
            <label className="field"><span>Amount (PKR)</span><input type="number" min="0.01" max={ledger.party.balance} step="0.01" required value={amount} onChange={event=>setAmount(event.target.value)}/></label>
            <label className="field"><span>Payment method</span><select value={method} onChange={event=>setMethod(event.target.value)}><option>Cash</option><option>Bank Transfer</option><option>Cheque</option></select></label>
            {method==='Cheque'&&<label className="field"><span>Cheque number</span><input required maxLength={80} value={chequeNumber} onChange={event=>setChequeNumber(event.target.value)}/></label>}
            <label className="field"><span>Location</span><select required value={location} onChange={event=>setLocation(event.target.value)}><option value="">Select location</option>{locations.filter(item=>item.status==='Active').map(item=><option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
            <label className="field"><span>Description (optional)</span><input maxLength={500} value={description} onChange={event=>setDescription(event.target.value)} placeholder="Settlement reference"/></label>
          </div>
          <div className="heading-actions">
            <button type="button" className="button secondary" disabled={busy} onClick={()=>setPaymentOpen(false)}>Cancel</button>
            <button type="submit" className="button primary" disabled={busy}>{busy?'Saving…':'Record payment'}</button>
          </div>
        </form>
      </section>
    </div>}
  </>;
}
