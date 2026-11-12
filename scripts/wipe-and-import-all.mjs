import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import path from 'node:path';
import {permissionKeys} from '../src/lib/permissions.js';
import Category from '../src/models/Category.js';
import Employee from '../src/models/Employee.js';
import Location from '../src/models/Location.js';
import Item from '../src/models/Item.js';
import Party from '../src/models/Party.js';
import Role from '../src/models/Role.js';
import Transaction from '../src/models/Transaction.js';
import AuditLog from '../src/models/AuditLog.js';
import CashEntry from '../src/models/CashEntry.js';
import Attendance from '../src/models/Attendance.js';
import EmployeeAdvance from '../src/models/EmployeeAdvance.js';
import Payroll from '../src/models/Payroll.js';
import Transfer from '../src/models/Transfer.js';
import StoreSettings from '../src/models/StoreSettings.js';
import LoginAttempt from '../src/models/LoginAttempt.js';

const require=createRequire(import.meta.url);
const {loadEnvConfig}=require('@next/env');
loadEnvConfig(process.cwd());

const FALLBACK_DB_NAME='ja-electronics';
const LOCATION_NAME='Main Shop - Light House';
const LOCATION_CODE='main-shop-light-house';
const adminUsername='arslan';
const adminName='Arslan';
const workbookPaths=[
  {
    file:process.env.SHAHID_KIRAN_WORKBOOK||path.join(process.env.USERPROFILE||homedir(),'Downloads','Shahid_Kiran.xlsx'),
    supplierName:'Shahid Kiran Electronic',
    key:'SK',
  },
  {
    file:process.env.IMRAN_BIBARK_WORKBOOK||path.join(process.env.USERPROFILE||homedir(),'Downloads','Imran_Bibark_Ledger.xlsx'),
    supplierName:'Imran Electronic',
    key:'IM',
  },
];
const models=[
  Item,Party,Transaction,CashEntry,AuditLog,Employee,Role,Location,Category,
  Attendance,EmployeeAdvance,Payroll,Transfer,StoreSettings,LoginAttempt,
];
const round=value=>Math.round((value+Number.EPSILON)*100)/100;
const cleanText=value=>{
  if(value==null)return '';
  if(typeof value==='object'){
    if(value instanceof Date)return value;
    if('result'in value)return cleanText(value.result);
    if(Array.isArray(value.richText))return value.richText.map(part=>part.text||'').join('').trim();
    if('text'in value)return String(value.text||'').trim();
    return '';
  }
  return String(value).trim();
};
const numberValue=value=>{
  if(typeof value==='number')return Number.isFinite(value)?value:0;
  const parsed=Number(String(value??'').replace(/[,\s₨$]/g,''));
  return Number.isFinite(parsed)?parsed:0;
};
const normalized=value=>cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

function databaseNameFromUri(uri){
  let parsed;
  try{
    parsed=new URL(uri);
  }catch{
    throw new Error('MONGODB_URI in .env.local is not a valid MongoDB URI.');
  }
  if(!['mongodb:','mongodb+srv:'].includes(parsed.protocol))throw new Error('MONGODB_URI must use mongodb:// or mongodb+srv://.');
  const candidate=decodeURIComponent(parsed.pathname.replace(/^\/+|\/+$/g,''));
  const invalid=!candidate||candidate.length>63||/[\/\\."$*<>:|?]/.test(candidate)||candidate.includes('\0');
  return {name:invalid?FALLBACK_DB_NAME:candidate,sanitized:invalid&&!!candidate};
}

function findHeaders(sheet){
  for(let rowNumber=1;rowNumber<=Math.min(sheet.rowCount,30);rowNumber++){
    const row=sheet.getRow(rowNumber);
    const headers=row.values.slice(1).map(normalized);
    const find=patterns=>headers.findIndex(header=>patterns.some(pattern=>pattern.test(header)));
    const columns={
      date:find([/^date$/]),
      description:find([/^description$/,/^particulars?$/]),
      quantity:find([/^qty$/,/^quantity$/]),
      debit:find([/^debit\b/,/^purchase\b/]),
      credit:find([/^credit\b/,/^payment\b/]),
      balance:find([/^balance$/,/running balance/]),
    };
    if(Object.values(columns).every(index=>index>=0))return {rowNumber,columns};
  }
  throw new Error(`Could not find the expected Date, Description, Qty, Debit, Credit, and Balance columns in sheet "${sheet.name}".`);
}

function readDate(value,description,file,rowNumber){
  if(/^opening balance$/i.test(description))return null;
  if(value instanceof Date&&!Number.isNaN(value.getTime()))return value;
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))throw new Error(`${path.basename(file)} row ${rowNumber}: invalid transaction date.`);
  return date;
}

async function parseWorkbook(config){
  const workbook=new ExcelJS.Workbook();
  await workbook.xlsx.readFile(config.file);
  const sheet=workbook.getWorksheet('Company Ledger');
  if(!sheet)throw new Error(`${path.basename(config.file)} has no "Company Ledger" worksheet.`);
  const {rowNumber:headerRow,columns}=findHeaders(sheet);
  const rows=[];
  let openingBalance=0;
  let openingRow=null;
  let running=0;

  for(let index=headerRow+1;index<=sheet.rowCount;index++){
    const row=sheet.getRow(index);
    const cell=column=>row.getCell(column+1).value;
    const dateValue=cell(columns.date);
    const description=cleanText(cell(columns.description));
    const rawQuantity=cell(columns.quantity);
    const quantity=numberValue(rawQuantity);
    const debit=round(numberValue(cell(columns.debit)));
    const credit=round(numberValue(cell(columns.credit)));
    const balance=numberValue(cell(columns.balance));
    const isOpening=/^opening balance$/i.test(description)||/^opening balance$/i.test(cleanText(dateValue));

    if(isOpening){
      if(openingRow)throw new Error(`${path.basename(config.file)} has more than one opening balance row.`);
      openingBalance=round(balance||debit-credit);
      if(openingBalance<0)throw new Error(`${path.basename(config.file)} row ${index}: opening payable cannot be negative.`);
      openingRow=index;
      running=openingBalance;
      continue;
    }

    if(!description&&!quantity&&!debit&&!credit)continue;
    if(!description)throw new Error(`${path.basename(config.file)} row ${index}: missing description.`);
    if(debit<0||credit<0||debit&&credit)throw new Error(`${path.basename(config.file)} row ${index}: expected a positive debit or credit, not both.`);
    if(quantity<0||quantity&&!Number.isInteger(quantity))throw new Error(`${path.basename(config.file)} row ${index}: quantity must be a positive whole number.`);
    if(debit>0&&quantity<=0)throw new Error(`${path.basename(config.file)} row ${index}: purchase amount has no positive quantity; cannot track stock.`);
    if(credit>0&&quantity>0)throw new Error(`${path.basename(config.file)} row ${index}: payment row also has a quantity; resolve the row before importing.`);
    if(!debit&&!credit)throw new Error(`${path.basename(config.file)} row ${index}: row has no debit or credit amount.`);

    const date=readDate(dateValue,description,config.file,index);
    running=round(running+debit-credit);
    const importedBalance=cell(columns.balance);
    const cachedBalance=typeof importedBalance==='number'?importedBalance:
      importedBalance&&typeof importedBalance==='object'&&typeof importedBalance.result==='number'?importedBalance.result:null;
    if(cachedBalance!=null&&Math.abs(round(cachedBalance)-running)>0.01){
      throw new Error(`${path.basename(config.file)} row ${index}: calculated balance ${running} does not match spreadsheet balance ${cachedBalance}.`);
    }

    rows.push({
      rowNumber:index,
      date,
      description,
      quantity,
      debit,
      credit,
      balance:running,
      kind:debit>0?'purchase':'payment',
    });
  }

  if(!rows.length&&openingBalance<=0)throw new Error(`${path.basename(config.file)} contains no importable ledger transactions.`);
  const firstDate=rows.reduce((min,row)=>row.date&&(!min||row.date<min)?row.date:min,null);
  if(openingBalance>0&&!firstDate)throw new Error(`${path.basename(config.file)} has an opening balance but no dated transactions.`);
  return {...config,rows,openingBalance,openingDate:openingBalance>0?new Date(firstDate.getTime()-86400000):null,closingBalance:running};
}

function itemMapFor(imports){
  const products=new Map();
  for(const supplier of imports){
    for(const row of supplier.rows){
      if(row.kind!=='purchase')continue;
      const key=normalized(row.description);
      const product=products.get(key)||{
        name:row.description.replace(/\s+/g,' ').trim(),
        quantity:0,
        purchaseValue:0,
        purchaseRate:0,
      };
      product.quantity+=row.quantity;
      product.purchaseValue=round(product.purchaseValue+row.debit);
      product.purchaseRate=round(product.purchaseValue/product.quantity);
      products.set(key,product);
    }
  }
  return products;
}

function paymentInfo(description,amount){
  const cheque=/(?:chq|cheque)/i.test(description);
  const bank=/(?:bank|transfer|online|ibft)/i.test(description);
  const method=cheque?'Cheque':bank?'Bank Transfer':'Cash';
  return {
    method,
    chequeNumber:cheque?(description.match(/(?:chq|cheque)\s*#?\s*\(?([a-z0-9-]+)\)?/i)?.[1]||undefined):undefined,
    paymentSplits:{cash:method==='Cash'?amount:0,bank:method==='Bank Transfer'?amount:0,cheque:method==='Cheque'?amount:0},
  };
}

async function run(){
  const imports=[];
  for(const config of workbookPaths)imports.push(await parseWorkbook(config));
  const products=itemMapFor(imports);
  const expectedBalance=imports.reduce((sum,supplier)=>sum+supplier.closingBalance,0);
  const summary=imports.map(supplier=>({
    supplier:supplier.supplierName,
    ledgerRows:supplier.rows.length,
    openingBalance:supplier.openingBalance,
    purchases:supplier.rows.filter(row=>row.kind==='purchase').length,
    purchasedUnits:supplier.rows.filter(row=>row.kind==='purchase').reduce((sum,row)=>sum+row.quantity,0),
    payments:supplier.rows.filter(row=>row.kind==='payment').length,
    closingPayable:supplier.closingBalance,
  }));
  console.log('Validated workbooks before database changes:');
  console.table(summary);
  console.log(`Distinct stock items: ${products.size}; total supplier payable: PKR ${expectedBalance.toFixed(2)}.`);

  const uri=process.env.MONGODB_URI;
  if(!uri)throw new Error('MONGODB_URI is not configured in .env.local.');
  const database=databaseNameFromUri(uri);
  console.log(`Target MongoDB database: ${database.name}${database.sanitized?' (invalid database path sanitized to ja-electronics)':''}.`);

  if(!process.argv.includes('--apply')){
    console.log('Dry run only. No database was changed. Use --apply with explicit destructive confirmation to import.');
    return;
  }
  if(process.env.ALLOW_DESTRUCTIVE_IMPORT!=='yes'){
    throw new Error('Refusing to wipe data. Set ALLOW_DESTRUCTIVE_IMPORT=yes and rerun with --apply.');
  }
  if(process.env.CONFIRM_WIPE_DATABASE!==database.name){
    throw new Error(`Refusing to wipe data. Set CONFIRM_WIPE_DATABASE=${database.name} to confirm the exact target.`);
  }
  const adminPassword=process.env.IMPORT_ADMIN_PASSWORD;
  if(!adminPassword||adminPassword.length<12)throw new Error('Set IMPORT_ADMIN_PASSWORD (at least 12 characters) in the environment; the password is never hard-coded in this script.');

  await mongoose.connect(uri,{dbName:database.name,serverSelectionTimeoutMS:10000});
  if(mongoose.connection.db.databaseName!==database.name)throw new Error('Connected database does not match the confirmed target.');

  const session=await mongoose.startSession();
  try{
    const mainLocationId=new mongoose.Types.ObjectId();
    const roleId=new mongoose.Types.ObjectId();
    const passwordHash=await bcrypt.hash(adminPassword,12);
    const now=new Date();
    const partyDocs=imports.map(supplier=>({
      _id:new mongoose.Types.ObjectId(),
      name:supplier.supplierName,
      partyType:'Supplier',
      balance:supplier.closingBalance,
      creditLimit:null,
      createdAt:now,
      updatedAt:now,
    }));
    const partyByName=new Map(partyDocs.map(party=>[party.name,party]));
    const productDocs=[...products.values()].map(product=>({
      _id:new mongoose.Types.ObjectId(),
      name:product.name,
      brand:'Imported',
      category:'Imported Stock',
      quantity:product.quantity,
      unit:'Pieces',
      purchaseRate:product.purchaseRate,
      saleRate:0,
      serialNumbers:[],
      godownLocation:LOCATION_NAME,
      locationId:mainLocationId,
      lowStockThreshold:0,
      createdAt:now,
      updatedAt:now,
    }));
    const itemByName=new Map(productDocs.map(item=>[normalized(item.name),item]));
    const transactionDocs=[];

    for(const supplier of imports){
      const party=partyByName.get(supplier.supplierName);
      if(supplier.openingBalance>0){
        transactionDocs.push({
          billNumber:`IMP-${supplier.key}-OPENING`,
          partyId:party._id,
          date:supplier.openingDate,
          type:'Opening Balance',
          items:[],
          grossTotal:supplier.openingBalance,
          netTotal:supplier.openingBalance,
          paymentSplits:{cash:0,bank:0,cheque:0},
          paidAmount:0,
          remainingUdhaar:supplier.openingBalance,
          description:'Imported opening supplier payable balance',
          branchLocation:LOCATION_NAME,
          locationId:mainLocationId,
          createdAt:now,
          updatedAt:now,
        });
      }

      for(const row of supplier.rows){
        const base={
          billNumber:`IMP-${supplier.key}-${String(row.rowNumber).padStart(5,'0')}`,
          partyId:party._id,
          date:row.date,
          items:[],
          grossTotal:row.kind==='purchase'?row.debit:0,
          netTotal:row.kind==='purchase'?row.debit:row.credit,
          paymentSplits:{cash:0,bank:0,cheque:0},
          paidAmount:row.kind==='purchase'?0:row.credit,
          remainingUdhaar:row.kind==='purchase'?row.debit:0,
          description:row.description,
          branchLocation:LOCATION_NAME,
          locationId:mainLocationId,
          createdAt:now,
          updatedAt:now,
        };
        if(row.kind==='purchase'){
          const item=itemByName.get(normalized(row.description));
          if(!item)throw new Error(`Missing stock item for ${supplier.supplierName}, workbook row ${row.rowNumber}.`);
          base.type='Purchase';
          base.items=[{
            itemId:item._id,
            quantity:row.quantity,
            rate:round(row.debit/row.quantity),
            total:row.debit,
            costRate:round(row.debit/row.quantity),
            serialNumbers:[],
          }];
        }else{
          const payment=paymentInfo(row.description,row.credit);
          base.type='Payment Paid';
          base.paymentMethod=payment.method;
          base.chequeNumber=payment.chequeNumber;
          base.paymentSplits=payment.paymentSplits;
        }
        transactionDocs.push(base);
      }
    }

    await session.withTransaction(async()=>{
      const db=mongoose.connection.db;
      const collections=await db.listCollections().toArray();
      for(const collection of collections){
        if(collection.type!=='collection'||collection.name.startsWith('system.'))continue;
        await db.collection(collection.name).deleteMany({}, {session});
      }

      await Location.create([{
        _id:mainLocationId,
        name:LOCATION_NAME,
        code:LOCATION_CODE,
        status:'Active',
        isDefault:true,
        createdAt:now,
        updatedAt:now,
      }],{session});
      await Role.create([{
        _id:roleId,
        roleName:'Super Admin',
        description:'Full access to all application permissions.',
        permissions:[...permissionKeys],
        createdAt:now,
        updatedAt:now,
      }],{session});
      await Category.create([{
        name:'Imported Stock',
        description:'Products imported from historical supplier ledgers.',
        createdAt:now,
        updatedAt:now,
      }],{session});
      await Employee.create([{
        type:'Admin',
        name:adminName,
        roleId,
        permissionOverrides:{},
        authVersion:0,
        credentials:{username:adminUsername,password:passwordHash},
        salaryBreakdown:{basic:0,medical:0,houseRent:0,utility:0,gross:0},
        createdAt:now,
        updatedAt:now,
      }],{session});
      if(partyDocs.length)await Party.insertMany(partyDocs,{session,ordered:true});
      if(productDocs.length)await Item.insertMany(productDocs,{session,ordered:true});
      if(transactionDocs.length)await Transaction.insertMany(transactionDocs,{session,ordered:true});
    });

    for(const model of models)await model.createIndexes();
    const [partyCount,itemCount,transactionCount,admin]=await Promise.all([
      Party.countDocuments(),
      Item.countDocuments(),
      Transaction.countDocuments(),
      Employee.findOne({'credentials.username':adminUsername}).select('+credentials.password').lean(),
    ]);
    if(partyCount!==imports.length||itemCount!==productDocs.length||transactionCount!==transactionDocs.length||!admin){
      throw new Error('Post-import verification failed: document counts or admin account did not match the validated import.');
    }
    const importedBalance=round((await Party.aggregate([{$match:{partyType:'Supplier'}},{$group:{_id:null,total:{$sum:'$balance'}}}]))[0]?.total||0);
    if(importedBalance!==round(expectedBalance))throw new Error('Post-import supplier balance total did not match the workbook ledger totals.');

    console.log(`Import completed successfully in database "${database.name}".`);
    console.log(`Created admin account "${adminUsername}".`);
    console.log(`Imported ${partyCount} suppliers, ${itemCount} stock items, and ${transactionCount} historical ledger transactions.`);
    console.log(`Verified total supplier payable: PKR ${importedBalance.toFixed(2)}.`);
    console.log('Imported stock uses purchaseRate as the app cost field; sale prices are unset (0) and must be configured.');
  }finally{
    await session.endSession();
    await mongoose.disconnect();
  }
}

run().catch(async error=>{
  console.error(`Import failed: ${error.message}`);
  if(mongoose.connection.readyState!==0)await mongoose.disconnect();
  process.exitCode=1;
});
