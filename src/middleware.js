import {NextResponse} from 'next/server';import {jwtVerify} from 'jose';
const publicAuth=new Set(['/login','/api/auth/login']);
const posApiRead=new Set(['/api/items','/api/parties','/api/employees','/api/locations','/api/status','/api/auth/me']);
const posApiWrite=new Set(['/api/transactions','/api/override','/api/auth/logout']);
export async function middleware(req){const path=req.nextUrl.pathname;
 if(!['GET','HEAD','OPTIONS'].includes(req.method)){const origin=req.headers.get('origin');try{if(origin&&new URL(origin).host!==req.headers.get('host'))return NextResponse.json({error:'Cross-origin request rejected'},{status:403})}catch{return NextResponse.json({error:'Invalid origin'},{status:403})}}
 // Local review mode only: production always enforces the original guards.
 if(process.env.NODE_ENV==='development'&&process.env.PREVIEW_BYPASS_AUTH==='true')return NextResponse.next();
 if(publicAuth.has(path))return NextResponse.next();
 let payload;try{const secret=process.env.SESSION_SECRET,token=req.cookies.get('ja_session')?.value;if(!secret||secret.length<32||!token)throw Error('No session');({payload}=await jwtVerify(token,new TextEncoder().encode(secret),{algorithms:['HS256']}));if(payload.kind!=='session'||!payload.sub||!['admin','pos'].includes(payload.scope))throw Error('Invalid session')}catch{if(path.startsWith('/api/'))return NextResponse.json({error:'Authentication required'},{status:401});return NextResponse.redirect(new URL('/login',req.url))}
 if(payload.scope==='pos'){
  if(path==='/')return NextResponse.redirect(new URL('/pos',req.url));
  if(path.startsWith('/api/')){let allowed=(req.method==='GET'&&posApiRead.has(path))||(req.method==='POST'&&posApiWrite.has(path));if(!allowed)return NextResponse.json({error:'Access restricted to POS'},{status:403})}
  else if(path!=='/pos'&&path!=='/unauthorized')return NextResponse.redirect(new URL('/unauthorized',req.url));
 }
 return NextResponse.next()
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
