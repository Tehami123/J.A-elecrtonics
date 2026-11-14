// Explicit opt-in bulk fixture seed. Use only with a disposable database.
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import {resolveMongoDatabaseName} from '../src/lib/database-name.js';

const { MONGODB_URI, ALLOW_DEMO_SEED } = process.env;
if (!MONGODB_URI || ALLOW_DEMO_SEED !== 'yes') {
  console.error('Set MONGODB_URI and ALLOW_DEMO_SEED=yes for a disposable demo database.');
  process.exit(1);
}

const categories = [
  ['Electronics', ['LED TV', 'Soundbar', 'Inverter', 'Bluetooth Speaker']],
  ['Appliances', ['Air Conditioner', 'Refrigerator', 'Washing Machine', 'Microwave']],
  ['Accessories', ['HDMI Cable', 'Power Bank', 'Remote Control', 'Wall Mount']],
  ['Spare Parts', ['Compressor', 'PCB Board', 'Capacitor', 'Fan Motor']],
];
const KarachiNames = [
  'Ahsan Khan', 'Bilal Ahmed', 'Danish Iqbal', 'Farhan Siddiqui', 'Hassan Raza',
  'Imran Shah', 'Junaid Qureshi', 'Kamran Ali', 'Muneeb Akhtar', 'Naveed Hussain',
  'Owais Malik', 'Qasim Rauf', 'Rashid Mehmood', 'Saad Tariq', 'Salman Sheikh',
  'Shahzaib Yousuf', 'Sohail Aslam', 'Taha Mirza', 'Usman Arif', 'Waqas Baig',
  'Yasir Mahmood', 'Zain Abbas', 'Areeb Zafar', 'Haris Nadeem', 'Kashif Rehman',
  'Mariam Khan', 'Nimra Ahmed', 'Sana Tariq', 'Hiba Raza', 'Ayesha Malik',
  'Noor Fatima', 'Mehwish Iqbal', 'Rabia Aslam', 'Kiran Shah', 'Sadia Qureshi',
];
const brands = ['Dawlance', 'Haier', 'Orient', 'PEL', 'Samsung', 'LG', 'Sony', 'Anex'];
const expenseTitles = ['Shop rent', 'Electricity bill', 'Internet service', 'Vehicle fuel', 'Packaging supplies', 'Repairs', 'Staff refreshments'];
const incomeTitles = ['Installation service', 'Delivery charges', 'Repair service', 'Warranty recovery', 'Scrap sale'];
const day = 86400000;

const money = (value) => Math.round(value * 100) / 100;
const phone = (index) => `03${String(100000000 + index).slice(-9)}`;
const pastDate = (daysAgo, offset = 0) => new Date(Date.now() - (daysAgo + offset) * day);
const pick = (items, index) => items[index % items.length];

await mongoose.connect(MONGODB_URI, { dbName: resolveMongoDatabaseName(MONGODB_URI), serverSelectionTimeoutMS: 10000 });
const db = mongoose.connection.db;
const session = await mongoose.startSession();

try {
  const admin = await db.collection('employees').findOne({ type: 'Admin' }, { session });
  if (!admin) throw new Error('Run bootstrap first so the existing admin account is available.');

  await session.withTransaction(async () => {
    // Preserve admins and locations. These collections contain only disposable fixture data.
    for (const name of ['items', 'parties', 'transactions', 'cashentries', 'auditlogs']) {
      await db.collection(name).deleteMany({ _id: { $ne: admin._id } }, { session });
    }
    await db.collection('employees').deleteMany({ type: { $ne: 'Admin' } }, { session });
    await db.collection('roles').deleteMany({ _id: { $ne: admin.roleId } }, { session });

    const now = new Date();
    const locations = await db.collection('locations').find({ status: 'Active' }, { session }).toArray();
    if (!locations.length) throw new Error('Create at least one active location before seeding.');

    const roleResult = await db.collection('roles').insertOne({
      roleName: 'Demo Sales Associate',
      description: 'Bulk fixture role for stress testing',
      permissions: ['pos.read', 'pos.create', 'inventory.read', 'parties.read'],
      createdAt: now,
      updatedAt: now,
    }, { session });

    const employeeDocs = [];
    for (let i = 0; i < 20; i += 1) {
      employeeDocs.push({
        type: 'Salesman',
        name: `Demo ${KarachiNames[i]}`,
        phone: phone(500 + i),
        address: pick(['Gulshan-e-Iqbal', 'North Nazimabad', 'Clifton', 'PECHS', 'Saddar'], i),
        roleId: roleResult.insertedId,
        locationId: locations[i % locations.length]._id,
        commissionPercentage: 1.5 + (i % 5) * 0.5,
        salaryBreakdown: { basic: 40000 + i * 1500, medical: 4000, houseRent: 8000, utility: 2500 },
        credentials: {
          username: `demo_sales_${String(i + 1).padStart(2, '0')}`,
          password: await bcrypt.hash(`DemoPassword${i + 1}!`, 10),
        },
        createdAt: now,
        updatedAt: now,
      });
    }
    const employeeResult = await db.collection('employees').insertMany(employeeDocs, { session });
    const employees = Object.values(employeeResult.insertedIds);

    const customerDocs = [];
    for (let i = 0; i < 32; i += 1) {
      customerDocs.push({
        name: `Customer ${KarachiNames[i]}`,
        partyType: 'Customer',
        phone: phone(100 + i),
        address: pick(['Gulshan-e-Iqbal', 'Clifton', 'Korangi', 'Defence', 'Nazimabad', 'Malir'], i),
        balance: 0,
        creditLimit: 100000 + (i % 5) * 50000,
        createdAt: now,
        updatedAt: now,
      });
    }
    const supplierDocs = [];
    for (let i = 0; i < 12; i += 1) {
      supplierDocs.push({
        name: `Supplier ${KarachiNames[20 + i]}`,
        partyType: 'Supplier',
        phone: phone(200 + i),
        address: pick(['Saddar Electronics Market', 'Tariq Road', 'Techno City', 'Shahrah-e-Liaquat'], i),
        balance: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
    const customerResult = await db.collection('parties').insertMany(customerDocs, { session });
    const supplierResult = await db.collection('parties').insertMany(supplierDocs, { session });
    const customers = Object.values(customerResult.insertedIds);
    const suppliers = Object.values(supplierResult.insertedIds);

    const itemDocs = [];
    for (let i = 0; i < 80; i += 1) {
      const [category, names] = categories[i % categories.length];
      const purchaseRate = 500 + (i % 16) * 1250 + Math.floor(i / 16) * 700;
      const saleRate = money(purchaseRate * (1.12 + (i % 6) * 0.035));
      const location = locations[i % locations.length];
      itemDocs.push({
        name: `${pick(names, i)} ${i + 1}`,
        brand: pick(brands, i),
        category,
        subCategory: `${category} stock`,
        unit: 'Pieces',
        quantity: 0,
        purchaseRate,
        saleRate,
        lowStockThreshold: 4 + (i % 8),
        serialNumbers: [],
        locationId: location._id,
        godownLocation: location.name,
        createdAt: now,
        updatedAt: now,
      });
    }
    const itemResult = await db.collection('items').insertMany(itemDocs, { session });
    const itemIds = Object.values(itemResult.insertedIds);
    const stock = itemDocs.map(() => 0);
    const transactions = [];

    for (let order = 0; order < 60; order += 1) {
      const lines = [];
      for (let line = 0; line < 4; line += 1) {
        const index = (order * 7 + line * 11) % itemIds.length;
        const quantity = 12 + ((order + line) % 19);
        const rate = itemDocs[index].purchaseRate;
        stock[index] += quantity;
        lines.push({ itemId: itemIds[index], quantity, rate, total: money(quantity * rate), costRate: rate, serialNumbers: [] });
      }
      const total = money(lines.reduce((sum, line) => sum + line.total, 0));
      const paid = order % 4 === 0 ? money(total * 0.35) : total;
      const location = locations[order % locations.length];
      transactions.push({
        billNumber: `DEMO-PUR-${String(order + 1).padStart(3, '0')}`,
        type: 'Purchase',
        partyId: suppliers[order % suppliers.length],
        date: pastDate(180 - order * 2),
        items: lines,
        grossTotal: total,
        discountPercentage: 0,
        discountFlat: 0,
        furtherTaxPercentage: 0,
        netTotal: total,
        paymentSplits: { cash: paid, bank: 0 },
        paidAmount: paid,
        remainingUdhaar: money(total - paid),
        branchLocation: location.name,
        locationId: location._id,
        dcNumber: `DC-${String(order + 1).padStart(3, '0')}`,
        poNumber: `PO-${String(order + 1).padStart(3, '0')}`,
        paymentTerms: paid < total ? 'Net 30 days' : 'Paid in full',
        createdAt: now,
        updatedAt: now,
      });
    }

    for (let order = 0; order < 60; order += 1) {
      const lines = [];
      for (let line = 0; line < 3; line += 1) {
        const index = (order * 5 + line * 13) % itemIds.length;
        const quantity = 1 + ((order + line) % 3);
        const rate = itemDocs[index].saleRate;
        stock[index] = Math.max(0, stock[index] - quantity);
        lines.push({ itemId: itemIds[index], quantity, rate, total: money(quantity * rate), costRate: itemDocs[index].purchaseRate, serialNumbers: [] });
      }
      const total = money(lines.reduce((sum, line) => sum + line.total, 0));
      const paid = order % 3 === 0 ? money(total * 0.5) : order % 3 === 1 ? 0 : total;
      const location = locations[order % locations.length];
      transactions.push({
        billNumber: `DEMO-SALE-${String(order + 1).padStart(3, '0')}`,
        type: 'Sale',
        partyId: customers[order % customers.length],
        salesmanId: employees[order % employees.length],
        date: pastDate(120 - order * 1.5),
        items: lines,
        grossTotal: total,
        discountPercentage: order % 7 === 0 ? 2 : 0,
        discountFlat: 0,
        furtherTaxPercentage: 0,
        netTotal: total,
        paymentSplits: { cash: paid, bank: 0 },
        paidAmount: paid,
        remainingUdhaar: money(total - paid),
        branchLocation: location.name,
        locationId: location._id,
        createdAt: now,
        updatedAt: now,
      });
    }
    await db.collection('transactions').insertMany(transactions, { session });
    await db.collection('items').bulkWrite(itemIds.map((id, i) => ({ updateOne: { filter: { _id: id }, update: { $set: { quantity: stock[i] } } } })), { session });

    const cashEntries = [];
    for (let i = 0; i < 25; i += 1) {
      cashEntries.push({
        type: 'Expense',
        date: pastDate(90 - i * 3),
        title: pick(expenseTitles, i),
        category: pick(['Operations', 'Utilities', 'Logistics', 'Maintenance'], i),
        amount: 5000 + (i % 9) * 2750,
        notes: `Demo expense entry ${i + 1}`,
        createdBy: admin._id,
        createdAt: now,
        updatedAt: now,
      }, {
        type: 'Income',
        date: pastDate(85 - i * 3),
        title: pick(incomeTitles, i),
        category: 'Other income',
        amount: 2500 + (i % 7) * 1800,
        notes: `Demo income entry ${i + 1}`,
        createdBy: admin._id,
        createdAt: now,
        updatedAt: now,
      });
    }
    await db.collection('cashentries').insertMany(cashEntries, { session });
    await db.collection('auditlogs').insertOne({ userId: admin._id, action: 'demo.bulk-seed', metadata: { products: 80, customers: 32, suppliers: 12, employees: 20, sales: 60, purchases: 60 }, createdAt: now, updatedAt: now }, { session });
  });
  console.log('Bulk disposable demo dataset created: 80 products, 44 parties, 20 employees, 60 sales, 60 purchases, and 50 cash entries.');
} finally {
  await session.endSession();
  await mongoose.disconnect();
}
