import bcrypt from 'bcryptjs';

// Deliberately only used to seed a fresh database; never used as an auth bypass.
export const SEED_USERNAME='tehami';
export const SEED_PASSWORD='AdminPassword2026!';
const modules=['pos','purchases','inventory','employees','parties','posReports','stockReports','financialSettings','locations','roles','audit'];
const actions=['create','read','edit','delete','editPrices','discount','void','export'];

export async function seedInitialAdmin(mongoose){
 const db=mongoose.connection.db;
 if(!db)throw new Error('MongoDB is not connected');
 // Never add a known-password administrator to an installation with employees.
 if(await db.collection('employees').countDocuments({}))return false;
 const session=await mongoose.startSession();let seeded=false;
 try{
  await session.withTransaction(async()=>{
   if(await db.collection('employees').countDocuments({},{session}))return;
   // Permanent marker prevents a deleted account from being silently recreated.
   await db.collection('system_bootstrap').insertOne({_id:'initial-admin',createdAt:new Date()},{session});
   let role=await db.collection('roles').findOne({roleName:'Super Admin'},{session});
   if(!role){const r=await db.collection('roles').insertOne({roleName:'Super Admin',description:'Initial administrator',permissions:modules.flatMap(m=>actions.map(a=>`${m}.${a}`)),createdAt:new Date(),updatedAt:new Date()},{session});role={_id:r.insertedId}}
   const now=new Date();
   await db.collection('employees').insertOne({type:'Admin',name:'Administrator',roleId:role._id,permissionOverrides:{},authVersion:0,credentials:{username:SEED_USERNAME,password:await bcrypt.hash(SEED_PASSWORD,12)},salaryBreakdown:{basic:0,medical:0,houseRent:0,utility:0,gross:0},createdAt:now,updatedAt:now},{session});
   for(const [name,code] of [['Main Showroom','main-showroom'],['Godown 1','godown-1'],['Godown 2','godown-2']]){
    let loc=await db.collection('locations').findOne({name},{session});
    if(!loc){const r=await db.collection('locations').insertOne({name,code,status:'Active',isDefault:name==='Main Showroom',createdAt:now,updatedAt:now},{session});loc={_id:r.insertedId}}
    await db.collection('items').updateMany({godownLocation:name,locationId:{$exists:false}},{$set:{locationId:loc._id}},{session});
    await db.collection('transactions').updateMany({branchLocation:name,locationId:{$exists:false}},{$set:{locationId:loc._id}},{session});
   }
   seeded=true;
  });
  return seeded;
 }catch(e){
  // Another instance may have seeded first, or this database was seeded and
  // its employees later removed. Never recreate a known password in either case.
  if(e.code===11000&&await db.collection('system_bootstrap').findOne({_id:'initial-admin'}))return false;
  throw e;
 }finally{await session.endSession()}
}
