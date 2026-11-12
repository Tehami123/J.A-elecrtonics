import {NextResponse} from 'next/server';
import mongoose from 'mongoose';
import {requirePermission} from '@/lib/auth';
import Party from '@/models/Party';
import Transaction from '@/models/Transaction';
import {privateApiCacheHeaders} from '@/lib/api-cache';

const round=n=>Math.round((n+Number.EPSILON)*100)/100;

export async function GET(req){
  try{
    await requirePermission('parties.read');
    const id=new URL(req.url).searchParams.get('partyId');
    if(!mongoose.isValidObjectId(id))return NextResponse.json({error:'Select a valid party.'},{status:400});
    const party=await Party.findById(id).lean();
    if(!party)return NextResponse.json({error:'Party not found'},{status:404});

    const transactions=await Transaction.find({partyId:id})
      .select('billNumber date type netTotal grossTotal paidAmount paymentSplits paymentMethod chequeNumber description notes branchLocation dcNumber poNumber items')
      .populate('items.itemId','name brand')
      .sort({date:1,createdAt:1,_id:1})
      .lean();

    let running=0;
    const entries=transactions.map(transaction=>{
      let debit=0,credit=0;
      if(party.partyType==='Supplier'){
        if(transaction.type==='Purchase'){
          debit=round(transaction.paidAmount||0);
          credit=round(transaction.netTotal||0);
        }else if(transaction.type==='Opening Balance'){
          credit=round(transaction.netTotal||0);
        }else if(transaction.type==='Payment Paid'){
          debit=round(transaction.netTotal||0);
        }else if(transaction.type==='Purchase Return'){
          debit=round(transaction.netTotal||0);
        }
        running=round(running+credit-debit);
      }else{
        if(transaction.type==='Sale'){
          debit=round(transaction.netTotal||0);
          credit=round(transaction.paidAmount||0);
        }else if(transaction.type==='Opening Balance'){
          debit=round(transaction.netTotal||0);
        }else if(transaction.type==='Payment Received'||transaction.type==='Sales Return'){
          credit=round(transaction.netTotal||0);
        }
        running=round(running+debit-credit);
      }

      const description=transaction.description||transaction.notes||(
        transaction.items?.length
          ? transaction.items.map(line=>`${line.itemId?.name||'Item'} × ${line.quantity}`).join(', ')
          : transaction.type
      );
      return {...transaction,description,debit,credit,running};
    });

    return NextResponse.json({party,entries},{headers:privateApiCacheHeaders});
  }catch(e){
    return NextResponse.json({error:e.message},{status:e.status||400});
  }
}
