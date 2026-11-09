import mongoose from 'mongoose';
const schema=new mongoose.Schema({roleName:{type:String,required:true,trim:true,unique:true},description:String,permissions:{type:[String],default:[]}},{timestamps:true});
export default mongoose.models.Role||mongoose.model('Role',schema);
