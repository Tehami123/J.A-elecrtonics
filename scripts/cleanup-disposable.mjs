import mongoose from 'mongoose';import {requireTestUri,TEST_DB_NAME} from './disposable-test-db.mjs';
// Drops the entire explicitly named disposable database, including any test UI
// writes. It never reads MONGODB_URI or targets the default/live database.
if(process.env.ALLOW_DESTRUCTIVE_TEST_DB_DROP!==TEST_DB_NAME)throw Error(`To confirm, set ALLOW_DESTRUCTIVE_TEST_DB_DROP=${TEST_DB_NAME}.`);
const uri=requireTestUri();await mongoose.connect(uri,{serverSelectionTimeoutMS:5000});
try{const db=mongoose.connection.db;if(db.databaseName!==TEST_DB_NAME)throw Error('Unexpected database; refusing to drop.');if(!await db.collection('test_fixtures').findOne({_id:'demo-v1'}))throw Error('Demo seed marker missing; refusing to drop.');await db.dropDatabase();console.log(`Dropped disposable database ${TEST_DB_NAME}; other databases were not touched.`)}finally{await mongoose.disconnect()}
