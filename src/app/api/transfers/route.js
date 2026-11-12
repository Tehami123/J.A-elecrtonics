import {NextResponse} from 'next/server';import {privateApiCacheHeaders} from '@/lib/api-cache';import mongoose from 'mongoose';import {requirePermission} from '@/lib/auth';import Location from '@/models/Location';import Item from '@/models/Item';import Transfer from '@/models/Transfer';import AuditLog from '@/models/AuditLog';
export async function GET(){try{await requirePermission('inventory.read');return NextResponse.json(await Transfer.find().populate('sender receiver','name').populate('sourceItem','name').populate('userId','name').sort({createdAt:-1}).limit(100).lean(),{headers:privateApiCacheHeaders})}catch(e){return NextResponse.json({error:e.message},{status:e.status||400})}}
export async function POST(req){
  let session;
  try{
    let user=await requirePermission('inventory.edit'),b=await req.json();
    if(!Number.isInteger(Number(b.quantity))||Number(b.quantity)<1||b.sender===b.receiver)throw Error('Invalid quantity or locations');
    session=await mongoose.startSession();
    let transfer;
    await session.withTransaction(async()=>{
      let [sender,receiver,source]=await Promise.all([
        Location.findById(b.sender).session(session),
        Location.findById(b.receiver).session(session),
        Item.findById(b.itemId).session(session)
      ]);
      if(!sender||!receiver||sender.status!=='Active'||receiver.status!=='Active'||!source||String(source.locationId)!==String(sender._id))throw Error('Select active locations and a valid source item');
      if(source.quantity<Number(b.quantity))throw Error('Insufficient stock');
      let serials=b.serialNumbers??[];
      if(!Array.isArray(serials)||(!source.serialNumbers.length&&serials.length))throw Error('Serial numbers are not tracked for this item');
      if(source.serialNumbers.length&&(serials.length!==Number(b.quantity)||new Set(serials).size!==serials.length||serials.some(s=>!source.serialNumbers.includes(s))))throw Error('Select one valid serial number per transferred unit');
      let dest=await Item.findOne({locationId:receiver._id,name:source.name,brand:source.brand,category:source.category,subCategory:source.subCategory}).session(session);
      if(!dest)dest=new Item({name:source.name,brand:source.brand,category:source.category,subCategory:source.subCategory,quantity:0,unit:source.unit,purchaseRate:source.purchaseRate,saleRate:source.saleRate,lowStockThreshold:source.lowStockThreshold,locationId:receiver._id,godownLocation:receiver.name});
      source.quantity-=Number(b.quantity);
      source.serialNumbers=source.serialNumbers.filter(s=>!serials.includes(s));
      dest.quantity+=Number(b.quantity);
      dest.serialNumbers.push(...serials);
      await source.save({session});
      await dest.save({session});
      transfer=(await Transfer.create([{sender:sender._id,receiver:receiver._id,sourceItem:source._id,destinationItem:dest._id,quantity:Number(b.quantity),serialNumbers:serials,userId:user._id}],{session}))[0];
      await AuditLog.create([{userId:user._id,action:'inventory.transfer',metadata:{transferId:transfer._id,sender:sender._id,receiver:receiver._id,item:source._id,quantity:Number(b.quantity)}}],{session});
    });
    return NextResponse.json(transfer,{status:201});
  }catch(e){
    return NextResponse.json({error:e.message},{status:e.status||400});
  }finally{
    await session?.endSession();
  }
}
