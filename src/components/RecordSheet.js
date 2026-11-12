'use client';

import {X,Printer,Pencil,Trash2,BookOpen} from 'lucide-react';
import {formatPKR} from '@/lib/currency';

export default function RecordSheet({record,type,onClose,onEdit,onDelete}){
  if(!record)return null;
  const isTransaction=type==='transaction';
  const rows=isTransaction
    ?[
      ['Document',record.billNumber],
      ['Type',record.type],
      ['Date',new Date(record.date).toLocaleString('en-PK')],
      ['Party',record.partyId?.name||'—'],
      ['Location',record.branchLocation||'—'],
      ['DC / PO',[record.dcNumber,record.poNumber].filter(Boolean).join(' / ')||'—'],
      ['Total',formatPKR(record.netTotal)],
      ['Paid',formatPKR(record.paidAmount)],
      ['Outstanding',formatPKR(record.remainingUdhaar)],
      ['Status',record.remainingUdhaar>0?'Outstanding':'Paid'],
    ]
    :Object.entries(record)
      .filter(([key,value])=>!['_id','__v','serialNumbers','credentials','permissionOverrides','createdAt','updatedAt'].includes(key)&&value!=null&&typeof value!=='object')
      .map(([key,value])=>[
        key.replace(/([A-Z])/g,' $1').replace(/^./,char=>char.toUpperCase()),
        ['balance','amount','saleRate','purchaseRate','creditLimit'].includes(key)?formatPKR(value):String(value),
      ]);

  return <div className="sheet-overlay" role="presentation" onClick={onClose}>
    <aside className="detail-sheet" role="dialog" aria-modal="true" aria-label="Record details" onClick={event=>event.stopPropagation()}>
      <header>
        <div><small>RECORD DETAILS</small><h2>{isTransaction?record.billNumber:record.name||record.title||'Details'}</h2></div>
        <button className="icon-btn" aria-label="Close details" onClick={onClose}><X size={20}/></button>
      </header>
      <div className="sheet-body">
        <div className="sheet-card">{rows.map(([label,value])=><div className="sheet-row" key={label}><span>{label}</span><b>{value}</b></div>)}</div>
        {isTransaction&&record.items?.length>0&&<>
          <h3>Items</h3>
          {record.items.map((item,index)=><div className="sheet-item" key={index}><span>{item.itemId?.name||'Item'} × {item.quantity}</span><b>{formatPKR(item.total)}</b></div>)}
        </>}
        {type==='party'&&<p className="sheet-note">Open the party ledger to review the statement, print/share it, or settle the balance.</p>}
        {isTransaction&&<p className="sheet-note">Status reflects the recorded outstanding balance. Saved transaction editing and deletion are not available.</p>}
      </div>
      <footer>
        {onEdit&&<button className="button secondary" onClick={onEdit}><Pencil size={15}/> Edit record</button>}
        {type==='party'&&<a className="button secondary" href={'/parties/ledger?id='+record._id}><BookOpen size={15}/> Open ledger &amp; settle</a>}
        {isTransaction&&<button className="button secondary" onClick={()=>window.print()}><Printer size={15}/> Print details</button>}
        {onDelete&&<button className="button danger" onClick={onDelete}><Trash2 size={15}/> Delete</button>}
      </footer>
    </aside>
  </div>;
}
