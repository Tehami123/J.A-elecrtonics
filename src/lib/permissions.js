export const modules=['pos','purchases','inventory','employees','parties','posReports','stockReports','financialSettings','locations','roles','audit'];
export const actions=['create','read','edit','delete','editPrices','discount','void','export'];
export const permissionKeys=modules.flatMap(m=>actions.map(a=>`${m}.${a}`));
