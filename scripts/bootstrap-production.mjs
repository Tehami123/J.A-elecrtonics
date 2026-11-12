import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import {permissionKeys} from '../src/lib/permissions.js';

const uri=process.env.MONGODB_URI;
const expectedDatabase=process.env.PRODUCTION_DB_NAME?.trim();
const confirmation=process.env.CONFIRM_PRODUCTION_BOOTSTRAP;
const allowProductionBootstrap=process.env.ALLOW_PROD_BOOTSTRAP;
const password=process.env.PRODUCTION_ADMIN_PASSWORD;
const locationName='Main Shop - Light House';
const locationCode='main-shop-light-house';
const collections=['items','parties','transactions','cashentries','auditlogs','employees','roles'];

function databaseNameFromUri(value){
  let parsed;
  try{
    parsed=new URL(value);
  }catch{
    throw new Error('MONGODB_URI must be a valid MongoDB connection URI.');
  }
  if(!['mongodb:','mongodb+srv:'].includes(parsed.protocol))throw new Error('MONGODB_URI must use mongodb:// or mongodb+srv://.');
  return decodeURIComponent(parsed.pathname.replace(/^\/+|\/+$/g,''));
}

if(!uri)throw new Error('Set MONGODB_URI to the production database connection string.');
if(!expectedDatabase)throw new Error('Set PRODUCTION_DB_NAME to the exact target database name.');
const actualDatabase=databaseNameFromUri(uri);
if(actualDatabase&&actualDatabase!==expectedDatabase)throw new Error('The database name in MONGODB_URI must match PRODUCTION_DB_NAME.');
if(allowProductionBootstrap!=='yes')throw new Error('Set ALLOW_PROD_BOOTSTRAP=yes to authorize the production cleanup.');
if(confirmation!==expectedDatabase)throw new Error(`Destructive bootstrap blocked. Set CONFIRM_PRODUCTION_BOOTSTRAP=${expectedDatabase} to confirm this database.`);
if(actualDatabase=== 'ja_electronics_disposable_test')throw new Error('Refusing to run against the disposable test database.');
if(!password)throw new Error('Set PRODUCTION_ADMIN_PASSWORD through your deployment secret manager; passwords are not stored in this script.');
if(password.length<12)throw new Error('PRODUCTION_ADMIN_PASSWORD must be at least 12 characters.');

const now=new Date();
const passwordHash=await bcrypt.hash(password,12);
const roleId=new mongoose.Types.ObjectId();
const roleDocs=[
  {
    _id:roleId,
    roleName:'Super Admin',
    description:'Full access to all permissions currently supported by the application.',
    permissions:[...permissionKeys],
    createdAt:now,
    updatedAt:now,
  },
  {
    roleName:'Manager',
    description:'Business operations access without role administration or sensitive employee/payroll controls.',
    permissions:permissionKeys.filter(key=>!key.startsWith('roles.')&&!['employees.delete','employees.editPrices','financialSettings.delete'].includes(key)),
    createdAt:now,
    updatedAt:now,
  },
  {
    roleName:'Cashier / POS Operator',
    description:'POS operations with read-only product, customer, employee, and location lookup access.',
    permissions:['pos.read','pos.create','inventory.read','parties.read','employees.read','locations.read'],
    createdAt:now,
    updatedAt:now,
  },
];

await mongoose.connect(uri,{dbName:expectedDatabase,serverSelectionTimeoutMS:10000});
const db=mongoose.connection.db;
if(!db||db.databaseName!==expectedDatabase)throw new Error('Connected database does not match the confirmed production database.');
const session=await mongoose.startSession();

try{
  await session.withTransaction(async()=>{
    for(const name of collections){
      await db.collection(name).deleteMany({},{session});
    }

    await db.collection('roles').insertMany(roleDocs,{session});

    const locations=db.collection('locations');
    const [byName,byCode]=await Promise.all([
      locations.findOne({name:locationName},{session}),
      locations.findOne({code:locationCode},{session}),
    ]);
    if(byName&&byCode&&!byName._id.equals(byCode._id)){
      throw new Error(`Location name "${locationName}" and code "${locationCode}" belong to different records; resolve the conflict before bootstrapping.`);
    }

    const existing=byName||byCode;
    let mainLocationId;
    if(existing){
      mainLocationId=existing._id;
      await locations.updateOne({_id:mainLocationId},{$set:{
        name:locationName,
        code:locationCode,
        status:'Active',
        isDefault:true,
        updatedAt:now,
      }},{session});
    }else{
      const result=await locations.insertOne({
        name:locationName,
        code:locationCode,
        status:'Active',
        isDefault:true,
        createdAt:now,
        updatedAt:now,
      },{session});
      mainLocationId=result.insertedId;
    }
    await locations.updateMany({_id:{$ne:mainLocationId}},{$set:{isDefault:false,updatedAt:now}},{session});

    await db.collection('employees').insertOne({
      type:'Admin',
      name:'Arslan',
      roleId,
      permissionOverrides:{},
      authVersion:0,
      credentials:{username:'arslan',password:passwordHash},
      salaryBreakdown:{basic:0,medical:0,houseRent:0,utility:0,gross:0},
      createdAt:now,
      updatedAt:now,
    },{session});
  });

  console.log(`Production bootstrap completed for database "${expectedDatabase}".`);
  console.log(`Cleared documents in: ${collections.join(', ')}.`);
  console.log(`Created admin "arslan", three role templates, and default location "${locationName}".`);
  console.log('Database collections and indexes were preserved. Rotate the bootstrap password after the first sign-in.');
}finally{
  await session.endSession();
  await mongoose.disconnect();
}
