// Dashboard dates use Karachi's calendar (UTC+05:00), independently of browser locale.
const dayKey=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const startOfDay=key=>new Date(`${key}T00:00:00+05:00`);
const shiftDay=(key,n)=>{let d=new Date(`${key}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const validKey=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(`${s}T00:00:00Z`))&&new Date(`${s}T00:00:00Z`).toISOString().slice(0,10)===s;
export function dashboardRange(period,customStart,customEnd,now=new Date()){
 const today=dayKey(now),[y,m]=today.split('-').map(Number);let start=today,end=today;
 if(period==='This Week'){let weekday=new Date(today+'T00:00:00Z').getUTCDay();start=shiftDay(today,-((weekday+6)%7))}
 if(period==='This Month')start=`${y}-${String(m).padStart(2,'0')}-01`;
 if(period==='Quarter to Date (QTD)')start=`${y}-${String(Math.floor((m-1)/3)*3+1).padStart(2,'0')}-01`;
 if(period==='Year to Date (YTD)')start=`${y}-01-01`;
 if(period==='Custom Range'){if(!validKey(customStart)||!validKey(customEnd)||customStart>customEnd)return null;start=customStart;end=customEnd}
 return {startKey:start,endKey:end,start:startOfDay(start),end:startOfDay(shiftDay(end,1))};
}
const n=x=>Number.isFinite(Number(x))?Number(x):0;
export function dashboardMetrics(transactions,range){
 const all=Array.isArray(transactions)?transactions:[];if(!range)return null;
 const filtered=all.filter(t=>{let d=new Date(t.date);return !isNaN(d)&&d>=range.start&&d<range.end});
 const sales=filtered.filter(t=>t.type==='Sale');const purchases=filtered.filter(t=>t.type==='Purchase');
 const revenue=sales.reduce((a,t)=>a+n(t.netTotal),0);let cost=0,missingCost=0;
 const ranking=new Map(),locations=new Map();
 for(const sale of sales){let lines=Array.isArray(sale.items)?sale.items:[],gross=lines.reduce((a,l)=>a+n(l.total),0);for(const line of lines){const qty=n(line.quantity);if(line.costRate===undefined||line.costRate===null||!Number.isFinite(Number(line.costRate)))missingCost++;else cost+=qty*n(line.costRate);let name=line.itemId?.name||'Unknown / removed item',brand=line.itemId?.brand||'',key=String(line.itemId?._id||`${brand}:${name}`),r=ranking.get(key)||{name,brand,units:0,revenue:0};r.units+=qty;r.revenue+=gross?n(line.total)/gross*n(sale.netTotal):0;ranking.set(key,r);let place=sale.branchLocation||'Unspecified',loc=locations.get(place)||{name:place,units:0};loc.units+=qty;locations.set(place,loc)}}
 // Outstanding invoices are reconstructed FIFO through the end of the period.
 const queues=new Map();const history=all.filter(t=>['Sale','Payment Received'].includes(t.type)&&new Date(t.date)<range.end&&!isNaN(new Date(t.date))).sort((a,b)=>new Date(a.date)-new Date(b.date)||String(a._id||'').localeCompare(String(b._id||'')));
 for(const t of history){let id=String(t.partyId?._id||t.partyId||'');if(!id)continue;let queue=queues.get(id)||[];if(t.type==='Sale'){let due=Math.max(0,n(t.netTotal)-n(t.paidAmount));if(due>0)queue.push({due,date:new Date(t.date)})}else{let payment=Math.max(0,n(t.netTotal));for(let bill of queue){let applied=Math.min(payment,bill.due);bill.due-=applied;payment-=applied;if(payment<=0)break}}queues.set(id,queue)}
 let outstanding=0,over30=0,over60=0;const asOf=new Date(range.end.getTime()-1);for(const queue of queues.values())for(const bill of queue){let due=Math.max(0,bill.due),age=Math.floor((asOf-bill.date)/86400000);outstanding+=due;if(age>60)over60+=due;else if(age>30)over30+=due}
 const days=Math.ceil((range.end-range.start)/86400000),monthly=days>62;let points=new Map();if(monthly){let [year,month]=range.startKey.split('-').map(Number),[endY,endM]=range.endKey.split('-').map(Number);for(let i=0;i<1200&&(year<endY||year===endY&&month<=endM);i++){let key=`${year}-${String(month).padStart(2,'0')}`;points.set(key,{key,label:key,revenue:0,expense:0});if(++month>12){month=1;year++}}}else{for(let i=0;i<days&&i<63;i++){let key=shiftDay(range.startKey,i);points.set(key,{key,label:key.slice(5),revenue:0,expense:0})}}
 for(const t of [...sales,...purchases]){let key=dayKey(new Date(t.date));if(monthly)key=key.slice(0,7);let p=points.get(key);if(p){if(t.type==='Sale')p.revenue+=n(t.paidAmount);else p.expense+=n(t.paidAmount)}}
 return {revenue,salesCount:sales.length,cost,missingCost,grossProfit:revenue-cost,outstanding,over30,over60,locations:[...locations.values()].filter(x=>x.units>0).sort((a,b)=>b.units-a.units),topItems:[...ranking.values()].sort((a,b)=>b.revenue-a.revenue).slice(0,8),chart:[...points.values()],sales,purchases};
}
