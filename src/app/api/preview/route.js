import {NextResponse} from 'next/server';
export async function GET(){return NextResponse.json({enabled:process.env.NODE_ENV==='development'&&process.env.PREVIEW_BYPASS_AUTH==='true'},{headers:{'Cache-Control':'no-store'}})}
