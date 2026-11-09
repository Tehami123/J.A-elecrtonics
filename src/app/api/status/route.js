import {requirePermission,currentUser} from '@/lib/auth';
import {NextResponse} from 'next/server';import connectDB from '@/lib/mongodb';
export async function GET(){try{if(!await currentUser())return NextResponse.json({connected:false},{status:401});await connectDB();return NextResponse.json({connected:true})}catch(e){return NextResponse.json({connected:false,message:e.message})}}
