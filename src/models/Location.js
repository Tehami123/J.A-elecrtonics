import mongoose from 'mongoose';
const schema=new mongoose.Schema({name:{type:String,required:true,trim:true,unique:true},code:{type:String,required:true,trim:true,lowercase:true,unique:true},address:String,contactPerson:String,status:{type:String,enum:['Active','Inactive'],default:'Active'},isDefault:{type:Boolean,default:false}},{timestamps:true});
export default mongoose.models.Location||mongoose.model('Location',schema);
