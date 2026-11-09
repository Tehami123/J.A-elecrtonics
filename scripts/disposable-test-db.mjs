// Safety guard shared by the optional, explicitly isolated test-data tools.
export const TEST_DB_NAME='ja_electronics_disposable_test';
export function requireTestUri(){
 const uri=process.env.TEST_MONGODB_URI;
 if(!uri)throw Error('Set TEST_MONGODB_URI explicitly; MONGODB_URI is never used by these tools.');
 let parsed;try{parsed=new URL(uri)}catch{throw Error('Invalid TEST_MONGODB_URI')}
 if(!['mongodb:','mongodb+srv:'].includes(parsed.protocol))throw Error('Expected a MongoDB URI');
 const dbName=decodeURIComponent(parsed.pathname.replace(/^\//,''));
 if(dbName!==TEST_DB_NAME)throw Error(`Refusing operation: the URI must name exactly ${TEST_DB_NAME}.`);
 return uri;
}
