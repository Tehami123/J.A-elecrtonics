import mongoose from 'mongoose';
const S=new mongoose.Schema({billNumber:{type:String,required:true,unique:true},partyId:{type:mongoose.Schema.Types.ObjectId,ref:'Party',required:true},salesmanId:{type:mongoose.Schema.Types.ObjectId,ref:'Employee'},date:{type:Date,default:Date.now},type:{type:String,enum:['Sale','Purchase','Payment Received','Payment Paid'],required:true},items:[{itemId:{type:mongoose.Schema.Types.ObjectId,ref:'Item'},quantity:Number,rate:Number,total:Number,costRate:{type:Number,min:0},serialNumbers:[String]}],grossTotal:Number,discountPercentage:Number,discountFlat:Number,furtherTaxPercentage:Number,netTotal:Number,paymentSplits:{cash:Number,bank:Number},paidAmount:Number,remainingUdhaar:Number,branchLocation:String,locationId:{type:mongoose.Schema.Types.ObjectId,ref:'Location'},notes:String,dcNumber:String,poNumber:String,paymentTerms:String,documentName:String},{timestamps:true});
S.index({date:-1,branchLocation:1});
S.index({partyId:1,date:1,createdAt:1});
S.index({locationId:1,date:-1});
S.index({salesmanId:1,type:1,date:1});
export default mongoose.models.Transaction||mongoose.model('Transaction',S);
