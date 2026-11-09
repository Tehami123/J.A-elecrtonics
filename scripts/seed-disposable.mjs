import mongoose from 'mongoose';import {requireTestUri,TEST_DB_NAME} from './disposable-test-db.mjs';
if(process.env.ALLOW_DISPOSABLE_SEED!=='yes')throw Error('Set ALLOW_DISPOSABLE_SEED=yes to seed a disposable test database.');
const uri=requireTestUri();await mongoose.connect(uri,{serverSelectionTimeoutMS:5000});const db=mongoose.connection.db;
try{
 if(db.databaseName!==TEST_DB_NAME)throw Error('Connected database name did not match the disposable test database.');
 for(const name of ['items','parties','transactions'])if(await db.collection(name).countDocuments({}))throw Error(`Refusing to seed: ${name} is not empty.`);
 if(await db.collection('test_fixtures').findOne({_id:'demo-v1'}))throw Error('This database has already been seeded.');
 const admin=await db.collection('employees').findOne({type:'Admin'});if(!admin)throw Error('Start the application against this disposable database first to create its initial admin.');
 const session=await mongoose.startSession();try{await session.withTransaction(async()=>{
  for(const name of ['items','parties','transactions'])if(await db.collection(name).countDocuments({},{session}))throw Error(`Refusing to seed: ${name} is not empty.`);
  const now=new Date(),tag={testFixture:'ja-demo-v1'};
  await db.collection('test_fixtures').insertOne({_id:'demo-v1',createdAt:now,scope:'isolated test database only'},{session});
  const places=[];for(const [name,code] of [['Main Showroom','main-showroom'],['Saddar Godown','demo-saddar'],['SITE Industrial Godown','demo-site']]){let location=await db.collection('locations').findOne({name},{session});if(!location){const inserted=await db.collection('locations').insertOne({...tag,name,code,status:'Active',isDefault:false,createdAt:now,updatedAt:now},{session});location={_id:inserted.insertedId,name}}places.push(location)}
  const employee=(await db.collection('employees').insertOne({...tag,name:'Demo Salesman',type:'Salesman',phone:'03000000000',locationId:places[0]._id,commissionPercentage:2,salaryBreakdown:{basic:50000,medical:5000,houseRent:10000,utility:3000,gross:68000},createdAt:now,updatedAt:now},{session})).insertedId;
  const customerIds=[];for(const name of ['Demo City Electronics','Demo Clifton Appliances','Demo Wholesale Buyer']){const p=await db.collection('parties').insertOne({...tag,name,partyType:'Customer',phone:'03000000001',address:'Karachi',balance:0,creditLimit:1000000,createdAt:now,updatedAt:now},{session});customerIds.push(p.insertedId)}
  const supplier=(await db.collection('parties').insertOne({...tag,name:'Demo Appliance Distributor',partyType:'Supplier',phone:'03000000002',address:'Karachi',balance:0,createdAt:now,updatedAt:now},{session})).insertedId;
  const products=[{name:'Demo Inverter AC 1.5 Ton',brand:'Dawlance',category:'AC',purchaseRate:100000,saleRate:120000},{name:'Demo Automatic Washing Machine',brand:'Haier',category:'Washing Machine',purchaseRate:45000,saleRate:58000}];
  let index=0;for(const location of places)for(const product of products){
   const allSerials=Array.from({length:10},(_,i)=>`DEMO-${index+1}-${String(i+1).padStart(3,'0')}`),sold=allSerials.slice(0,2),remaining=allSerials.slice(2);
   const item=(await db.collection('items').insertOne({...tag,...product,subCategory:'Demo',quantity:remaining.length,unit:'Pieces',serialNumbers:remaining,locationId:location._id,godownLocation:location.name,lowStockThreshold:3,createdAt:now,updatedAt:now},{session})).insertedId;
   const purchaseTotal=10*product.purchaseRate;await db.collection('transactions').insertOne({...tag,billNumber:`TEST-PUR-${index+1}`,type:'Purchase',partyId:supplier,locationId:location._id,branchLocation:location.name,date:new Date(now.getTime()-90*86400000),items:[{itemId:item,quantity:10,rate:product.purchaseRate,total:purchaseTotal,costRate:product.purchaseRate,serialNumbers:allSerials}],grossTotal:purchaseTotal,discountPercentage:0,discountFlat:0,furtherTaxPercentage:0,netTotal:purchaseTotal,paymentSplits:{cash:purchaseTotal,bank:0},paidAmount:purchaseTotal,remainingUdhaar:0,createdAt:now,updatedAt:now},{session});
   const total=2*product.saleRate,paid=product.saleRate,partyId=customerIds[index%customerIds.length],age=[0,40,75][index%3];await db.collection('transactions').insertOne({...tag,billNumber:`TEST-SALE-${index+1}`,type:'Sale',partyId,salesmanId:employee,locationId:location._id,branchLocation:location.name,date:new Date(now.getTime()-age*86400000),items:[{itemId:item,quantity:2,rate:product.saleRate,total,costRate:product.purchaseRate,serialNumbers:sold}],grossTotal:total,discountPercentage:0,discountFlat:0,furtherTaxPercentage:0,netTotal:total,paymentSplits:{cash:paid,bank:0},paidAmount:paid,remainingUdhaar:total-paid,createdAt:now,updatedAt:now},{session});
   await db.collection('parties').updateOne({_id:partyId},{$inc:{balance:total-paid}},{session});index++;
  }
 });console.log('Disposable demo dataset created. All records are test-only.')}finally{await session.endSession()}
}finally{await mongoose.disconnect()}
