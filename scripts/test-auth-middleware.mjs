// HTTP smoke test for the running app. This does not replace database integration tests.
import {SignJWT} from 'jose';
const base=process.env.TEST_BASE_URL||'http://localhost:3000',secret=process.env.SESSION_SECRET;if(!secret||secret.length<32)throw Error('Set SESSION_SECRET to the same value as the test server');const key=new TextEncoder().encode(secret);
async function call(path,token,method='GET'){return fetch(base+path,{method,redirect:'manual',headers:token?{cookie:'ja_session='+token}:{}})}
async function token(claims){return new SignJWT(claims).setProtectedHeader({alg:'HS256'}).setSubject('000000000000000000000001').setIssuedAt().setExpirationTime('5m').sign(key)}
function assert(ok,msg){if(!ok)throw Error(msg);console.log('PASS '+msg)}
const cashier=await token({kind:'session',scope:'pos'}),admin=await token({kind:'session',scope:'admin'}),override=await token({kind:'override',scope:'admin'});
for(const p of ['/','/dashboard','/pos','/inventory','/purchases/new','/reports/stock','/parties','/employees']){let r=await call(p);assert(r.status===307&&r.headers.get('location').endsWith('/login'),'anonymous '+p+' redirects to login')}
for(const p of ['/inventory','/reports/stock','/employees','/parties/ledger','/dashboard']){let r=await call(p,cashier);assert(r.status===307&&r.headers.get('location').endsWith('/unauthorized'),'cashier '+p+' denied')}
assert((await call('/api/ledger',cashier)).status===403,'cashier ledger API denied');assert((await call('/api/items',cashier,'POST')).status===403,'cashier inventory write denied');assert((await call('/api/transactions',cashier,'GET')).status===403,'cashier transaction history denied');assert((await call('/api/hr',admin)).status===401,'APIs independently reject signed tokens without an existing user');assert((await call('/api/hr',override)).status===401,'override token cannot be used as session');
