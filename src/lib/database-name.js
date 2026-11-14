const DEFAULT_DATABASE_NAME='ja-electronics';
const FORBIDDEN_DATABASE_NAME_CHARACTERS=/[\/\\."$*<>:|?]/;

export function resolveMongoDatabaseName(uri){
  let parsed;
  try{
    parsed=new URL(uri);
  }catch{
    throw new Error('MONGODB_URI must be a valid MongoDB connection URI.');
  }
  if(!['mongodb:','mongodb+srv:'].includes(parsed.protocol)){
    throw new Error('MONGODB_URI must use mongodb:// or mongodb+srv://.');
  }

  let candidate;
  try{
    candidate=decodeURIComponent(parsed.pathname.replace(/^\/+|\/+$/g,''));
  }catch{
    throw new Error('MONGODB_URI contains an invalid encoded database name.');
  }
  if(!candidate||candidate.length>63||FORBIDDEN_DATABASE_NAME_CHARACTERS.test(candidate)||candidate.includes('\0')){
    return DEFAULT_DATABASE_NAME;
  }
  return candidate;
}
