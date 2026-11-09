import mongoose from 'mongoose';
const S=new mongoose.Schema({_id:String,count:{type:Number,default:0},lockedUntil:Date,expiresAt:{type:Date,required:true}},{versionKey:false});S.index({expiresAt:1},{expireAfterSeconds:0});export default mongoose.models.LoginAttempt||mongoose.model('LoginAttempt',S);
