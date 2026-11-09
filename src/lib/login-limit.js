import {createHash} from 'crypto';import LoginAttempt from '@/models/LoginAttempt';
const hash=username=>createHash('sha256').update(String(username).trim().toLowerCase()).digest('hex');
export async function locked(username){const x=await LoginAttempt.findById(hash(username)).lean();return !!x?.lockedUntil&&x.lockedUntil>new Date()}
export async function failed(username){const now=new Date(),id=hash(username);let entry=await LoginAttempt.findOneAndUpdate({_id:id},[{$set:{count:{$cond:[{$lte:[{$ifNull:['$expiresAt',new Date(0)]},now]},1,{$add:[{$ifNull:['$count',0]},1]}]},expiresAt:{$cond:[{$lte:[{$ifNull:['$expiresAt',new Date(0)]},now]},new Date(now.getTime()+15*60*1000),'$expiresAt']}}}],{upsert:true,new:true});if(entry.count>=5)await LoginAttempt.updateOne({_id:id},{$set:{lockedUntil:entry.expiresAt}})}
export async function clearAttempts(username){await LoginAttempt.deleteOne({_id:hash(username)})}
