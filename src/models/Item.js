import mongoose from 'mongoose';
const S=new mongoose.Schema({name:{type:String,required:true,trim:true},brand:{type:String,required:true},category:{type:String,required:true},subCategory:String,quantity:{type:Number,default:0,min:0},unit:{type:String,enum:['Pieces'],default:'Pieces'},purchaseRate:{type:Number,default:0,min:0},saleRate:{type:Number,default:0,min:0},serialNumbers:[String],godownLocation:{type:String,required:true},locationId:{type:mongoose.Schema.Types.ObjectId,ref:'Location'},lowStockThreshold:{type:Number,default:5,min:0}},{timestamps:true});
// locationId is the godown reference used by catalog and stock lookups.
S.index({locationId:1,name:1});
S.index({locationId:1,brand:1,category:1});
export default mongoose.models.Item||mongoose.model('Item',S);
