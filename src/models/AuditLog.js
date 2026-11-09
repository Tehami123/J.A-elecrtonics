import mongoose from 'mongoose';
const schema=new mongoose.Schema({userId:{type:mongoose.Schema.Types.ObjectId,ref:'Employee'},action:{type:String,required:true},metadata:mongoose.Schema.Types.Mixed},{timestamps:true});schema.index({createdAt:-1});export default mongoose.models.AuditLog||mongoose.model('AuditLog',schema);
