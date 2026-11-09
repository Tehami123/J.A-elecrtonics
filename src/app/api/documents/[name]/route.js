import {requirePermission,currentUser} from '@/lib/auth';
import {NextResponse} from 'next/server';import {readFile} from 'fs/promises';import path from 'path';
export const runtime='nodejs';
export async function GET(req,{params}){try{await requirePermission('purchases.read');let {name}=await params;if(!/^[a-f0-9-]{36}\.(pdf|jpg|png|webp)$/.test(name))return new NextResponse('Not found',{status:404});let bytes=await readFile(path.join(process.cwd(),'uploads',name));return new NextResponse(bytes,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${name}"`,'X-Content-Type-Options':'nosniff'}})}catch{return new NextResponse('Not found',{status:404})}}
