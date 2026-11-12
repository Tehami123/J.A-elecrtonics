import {requirePermission,can,verifyToken,currentUser} from '@/lib/auth';
import Location from '@/models/Location';
import AuditLog from '@/models/AuditLog';
import {NextResponse} from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import Item from '@/models/Item';
import Party from '@/models/Party';
import Employee from '@/models/Employee';
import {privateApiCacheHeaders} from '@/lib/api-cache';

const round=n=>Math.round((n+Number.EPSILON)*100)/100;
const fail=e=>NextResponse.json({error:e.message},{status:e.status||400});

export async function GET(){
  try{
    const user=await currentUser();
    if(!user||!['posReports.read','stockReports.read','purchases.read'].some(p=>can(user,p))){
      throw Object.assign(Error('Permission denied'),{status:user?403:401});
    }
    await connectDB();
    const query=(can(user,'purchases.read')||can(user,'stockReports.read'))?{}:{type:{$ne:'Purchase'}};
    const data=await Transaction.find(query)
      .populate('partyId','name')
      .populate('salesmanId','name')
      .populate('items.itemId','name brand category')
      .sort({date:-1,createdAt:-1})
      .lean();
    if(!can(user,'stockReports.read')&&!can(user,'inventory.editPrices')){
      for(const transaction of data)for(const line of transaction.items||[])delete line.costRate;
    }
    return NextResponse.json(data,{headers:privateApiCacheHeaders});
  }catch(e){
    return fail(e);
  }
}

export async function POST(req){
  let session;
  try{
    await connectDB();
    const b=await req.json();
    const user=await requirePermission(['Purchase','Purchase Return'].includes(b.type)?'purchases.create':['Sale','Sales Return'].includes(b.type)?'pos.create':'parties.edit');
    if(!['Sale','Purchase','Payment Received','Payment Paid','Sales Return','Purchase Return'].includes(b.type))throw Error('Invalid transaction type');
    if(!b.partyId)throw Error('Select a party');

    session=await mongoose.startSession();
    let result;
    await session.withTransaction(async()=>{
      const location=await Location.findOne({_id:b.locationId,status:'Active'}).session(session);
      if(!location)throw Error('Select an active location');
      const party=await Party.findById(b.partyId).session(session);
      if(!party)throw Error('Party not found');
      if((['Sale','Sales Return','Payment Received'].includes(b.type)&&party.partyType!=='Customer')||
         (['Purchase','Purchase Return','Payment Paid'].includes(b.type)&&party.partyType!=='Supplier')){
        throw Error('Invalid party type');
      }
      if(b.salesmanId&&!await Employee.findById(b.salesmanId).session(session))throw Error('Salesman not found');

      const isReturn=['Sales Return','Purchase Return'].includes(b.type);
      let original=null;
      const returnedQuantities=new Map();
      const returnedSerials=new Map();
      if(isReturn){
        if(!mongoose.isValidObjectId(b.returnOf))throw Error('Select the original bill for this return');
        const originalType=b.type==='Sales Return'?'Sale':'Purchase';
        original=await Transaction.findOne({
          _id:b.returnOf,
          partyId:party._id,
          locationId:location._id,
          type:originalType,
        }).session(session).lean();
        if(!original||!Number(original.grossTotal)||!Number(original.netTotal))throw Error('Original bill not found or cannot be returned');
        const previousReturns=await Transaction.find({returnOf:original._id,type:b.type}).select('items').session(session).lean();
        for(const returned of previousReturns){
          for(const line of returned.items||[]){
            const itemId=String(line.itemId);
            returnedQuantities.set(itemId,(returnedQuantities.get(itemId)||0)+Number(line.quantity||0));
            const serials=returnedSerials.get(itemId)||new Set();
            for(const serial of line.serialNumbers||[])serials.add(serial);
            returnedSerials.set(itemId,serials);
          }
        }
      }

      const items=[];
      const lineDescriptions=[];
      let gross=0;
      for(const line of b.items||[]){
        const originalLine=isReturn?original.items.find(item=>String(item.itemId)===String(line.itemId)):null;
        if(isReturn&&!originalLine)throw Error('The selected item is not on the original bill');
        const serialNumbers=line.serialNumbers??[];
        if(!Array.isArray(serialNumbers))throw Error('Invalid item serial numbers');
        const quantity=Number(line.quantity);
        const rate=Number(line.rate??(isReturn?originalLine.rate:undefined));
        if(!Number.isInteger(quantity)||quantity<=0||!Number.isFinite(rate)||rate<0)throw Error('Invalid item quantity or rate');
        if(isReturn){
          if(rate!==Number(originalLine.rate))throw Error('Return prices must match the original bill');
          const itemId=String(line.itemId);
          if((returnedQuantities.get(itemId)||0)+quantity>Number(originalLine.quantity)){
            throw Error('Return quantity exceeds the units on the original bill');
          }
          returnedQuantities.set(itemId,(returnedQuantities.get(itemId)||0)+quantity);
          const originalSerials=originalLine.serialNumbers||[];
          const usedSerials=returnedSerials.get(itemId)||new Set();
          const serials=serialNumbers;
          if(originalSerials.length
            ?serials.length!==quantity||new Set(serials).size!==serials.length||serials.some(serial=>!originalSerials.includes(serial)||usedSerials.has(serial))
            :serials.length>0){
            throw Error('Return serial numbers must match unreturned units from the original bill');
          }
          for(const serial of line.serialNumbers||[])usedSerials.add(serial);
          returnedSerials.set(itemId,usedSerials);
        }
        const item=await Item.findById(line.itemId).session(session);
        if(!item||String(item.locationId)!==String(location._id))throw Error('Item not found in selected branch');

        if(b.type==='Sale'){
          if(rate!==item.saleRate&&!can(user,'pos.editPrices'))throw Error('Price override permission required');
          if(item.quantity<quantity)throw Error('Insufficient stock for '+item.name);
          if((item.serialNumbers.length||serialNumbers.length)&&
             (serialNumbers.length!==quantity||new Set(serialNumbers).size!==serialNumbers.length||serialNumbers.some(s=>!item.serialNumbers.includes(s)))){
            throw Error('Invalid serial numbers for '+item.name);
          }
          item.quantity-=quantity;
          item.serialNumbers=item.serialNumbers.filter(s=>!serialNumbers.includes(s));
        }else if(b.type==='Purchase'){
          if(!can(user,'purchases.editPrices'))throw Error('Purchase price permission required');
          item.purchaseRate=round((item.quantity*item.purchaseRate+quantity*rate)/(item.quantity+quantity));
          item.quantity+=quantity;
          if(line.saleRate!==undefined){
            const saleRate=Number(line.saleRate);
            if(!Number.isFinite(saleRate)||saleRate<0)throw Error('Invalid sale price');
            item.saleRate=saleRate;
          }
          item.serialNumbers.push(...serialNumbers);
        }else if(b.type==='Sales Return'){
          if((item.serialNumbers.length||serialNumbers.length)&&
             (serialNumbers.length!==quantity||new Set(serialNumbers).size!==serialNumbers.length||serialNumbers.some(s=>item.serialNumbers.includes(s)))){
            throw Error('Enter one unique serial number for each returned unit of '+item.name);
          }
          item.quantity+=quantity;
          item.serialNumbers.push(...serialNumbers);
        }else if(b.type==='Purchase Return'){
          if(item.quantity<quantity)throw Error('Insufficient stock for '+item.name);
          if((item.serialNumbers.length||serialNumbers.length)&&
             (serialNumbers.length!==quantity||new Set(serialNumbers).size!==serialNumbers.length||serialNumbers.some(s=>!item.serialNumbers.includes(s)))){
            throw Error('Select one valid serial number per returned unit of '+item.name);
          }
          item.quantity-=quantity;
          item.serialNumbers=item.serialNumbers.filter(serial=>!serialNumbers.includes(serial));
        }else{
          throw Error('Payments cannot contain items');
        }

        await item.save({session});
        const lineTotal=round(quantity*rate);
        items.push({
          itemId:item._id,
          quantity,
          rate,
          total:lineTotal,
          costRate:['Sale','Sales Return'].includes(b.type)?item.purchaseRate:rate,
          serialNumbers,
        });
        lineDescriptions.push(`${quantity} × ${item.name}`);
        gross=round(gross+lineTotal);
      }
      if(['Sale','Purchase','Sales Return','Purchase Return'].includes(b.type)&&!items.length)throw Error('Add at least one item');

      const discount=Number(b.discountPercentage)||0;
      const flat=Number(b.discountFlat)||0;
      const tax=Number(b.furtherTaxPercentage)||0;
      const cash=Number(b.paymentSplits?.cash)||0;
      const bank=Number(b.paymentSplits?.bank)||0;
      const cheque=Number(b.paymentSplits?.cheque)||0;
      if([discount,flat,tax,cash,bank,cheque].some(x=>!Number.isFinite(x)||x<0)||discount>100){
        throw Error('Invalid financial values');
      }
      if(b.paymentMethod&&!['Cash','Bank Transfer','Cheque'].includes(b.paymentMethod))throw Error('Invalid payment method');
      if(cheque>0&&!String(b.chequeNumber||'').trim())throw Error('Enter the cheque number');

      if(b.type==='Sale'&&(discount>0||flat>Number(process.env.POS_FLAT_DISCOUNT_THRESHOLD||0))&&!can(user,'pos.discount')){
        let approval;
        try{approval=await verifyToken(b.overrideToken)}catch{}
        if(!approval||approval.kind!=='override'||approval.sub!==String(user._id)||approval.action!=='pos.discount'){
          throw Error('Manager authorization required for this discount');
        }
      }

      const net=isReturn
        ?round(gross*Number(original.netTotal)/Number(original.grossTotal))
        :['Sale','Purchase'].includes(b.type)
          ?round(Math.max(0,(gross*(1-discount/100)-flat))*(1+tax/100))
        :round(Number(b.netTotal));
      if(!Number.isFinite(net)||net<0)throw Error('Invalid total');

      const nonCashTender=round(bank+cheque);
      const totalTender=round(cash+nonCashTender);
      let appliedCash=Math.min(cash,Math.max(0,net-nonCashTender));
      let paid=round(appliedCash+nonCashTender);
      let remaining=round(Math.max(0,net-paid));
      const changeAmount=round(Math.max(0,totalTender-net));

      if(['Payment Received','Payment Paid'].includes(b.type)){
        if(net<=0||net>party.balance||Math.abs(totalTender-net)>0.001){
          throw Error('Payment must match the tender and not exceed the outstanding balance');
        }
        paid=net;
        remaining=0;
        appliedCash=cash;
      }else if(nonCashTender>net){
        throw Error('Bank and cheque payments cannot exceed the transaction total');
      }
      if(['Sales Return','Purchase Return'].includes(b.type)&&totalTender>0){
        throw Error('Returns are recorded as ledger credits; do not enter a payment tender.');
      }
      if(isReturn){
        paid=0;
        remaining=0;
      }

      if(b.type==='Sale'&&party.creditLimit!=null&&party.balance+remaining>party.creditLimit&&!can(user,'parties.discount')){
        let approval;
        try{approval=await verifyToken(b.creditOverrideToken)}catch{}
        if(!approval||approval.kind!=='override'||approval.sub!==String(user._id)||approval.action!=='parties.discount'){
          throw Error('Customer credit limit exceeded; manager approval required');
        }
      }

      if(b.type==='Sale'||b.type==='Purchase')party.balance=round(party.balance+remaining);
      else if(b.type==='Sales Return'||b.type==='Purchase Return')party.balance=round(party.balance-net);
      else party.balance=round(party.balance-net);
      await party.save({session});

      const billNumber='JA-'+Date.now()+'-'+Math.random().toString(36).slice(2,6).toUpperCase();
      const paymentMethod=b.paymentMethod||(
        cheque>0?'Cheque':bank>0?'Bank Transfer':'Cash'
      );
      const lineDescription=lineDescriptions.join(', ');
      const description=String(b.description||b.notes||(
        b.type==='Purchase'?`Purchase bill${lineDescription?` — ${lineDescription}`:''}`:
        b.type==='Sale'?`POS sale${lineDescription?` — ${lineDescription}`:''}`:
        b.type==='Purchase Return'?`Purchase return against ${original.billNumber}${lineDescription?` — ${lineDescription}`:''}`:
        b.type==='Sales Return'?`Sales return against ${original.billNumber}${lineDescription?` — ${lineDescription}`:''}`:
        `${b.type} via ${paymentMethod}${b.chequeNumber?` #${b.chequeNumber}`:''}`
      )).trim().slice(0,500);

      [result]=await Transaction.create([{
        billNumber,
        partyId:party._id,
        returnOf:original?._id,
        salesmanId:b.salesmanId||undefined,
        date:b.date||new Date(),
        type:b.type,
        items,
        grossTotal:gross,
        discountPercentage:discount,
        discountFlat:flat,
        furtherTaxPercentage:tax,
        netTotal:net,
        paymentSplits:{cash:appliedCash,bank,cheque},
        paymentMethod,
        chequeNumber:b.chequeNumber,
        description,
        paidAmount:paid,
        remainingUdhaar:remaining,
        changeAmount,
        branchLocation:location.name,
        locationId:location._id,
        notes:b.notes,
        dcNumber:b.dcNumber,
        poNumber:b.poNumber,
        paymentTerms:b.paymentTerms,
        documentName:b.documentName,
      }],{session});
      await AuditLog.create([{
        userId:user._id,
        action:'transaction.'+b.type.toLowerCase(),
        metadata:{transactionId:result._id,discount,flat,locationId:location._id},
      }],{session});
    });
    return NextResponse.json(result,{status:201});
  }catch(e){
    return fail(e);
  }finally{
    await session?.endSession();
  }
}
