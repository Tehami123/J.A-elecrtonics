import mongoose from 'mongoose';
const S=new mongoose.Schema({name:{type:String,required:true,trim:true},phone:String,address:String,partyType:{type:String,enum:['Customer','Supplier'],required:true},balance:{type:Number,default:0},creditLimit:{type:Number,default:null,min:0,validate:{validator:v=>v==null||Number.isFinite(v),message:'Invalid credit limit'}}},{timestamps:true});
export default mongoose.models.Party||mongoose.model('Party',S);
