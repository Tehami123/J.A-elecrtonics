import mongoose from 'mongoose';
const S=new mongoose.Schema({billNumber:{type:String,required:true,unique:true},partyId:{type:mongoose.Schema.Types.ObjectId,ref:'Party',required:true},returnOf:{type:mongoose.Schema.Types.ObjectId,ref:'Transaction'},salesmanId:{type:mongoose.Schema.Types.ObjectId,ref:'Employee'},date:{type:Date,default:Date.now},type:{type:String,enum:['Sale','Purchase','Payment Received','Payment Paid','Sales Return','Purchase Return','Opening Balance'],required:true},items:[{itemId:{type:mongoose.Schema.Types.ObjectId,ref:'Item'},quantity:Number,rate:Number,total:Number,costRate:{type:Number,min:0},serialNumbers:[String]}],grossTotal:Number,discountPercentage:Number,discountFlat:Number,furtherTaxPercentage:Number,netTotal:Number,paymentSplits:{cash:Number,bank:Number,cheque:Number},paymentMethod:{type:String,enum:['Cash','Bank Transfer','Cheque']},chequeNumber:{type:String,trim:true,maxlength:80},description:{type:String,trim:true,maxlength:500},paidAmount:Number,remainingUdhaar:Number,changeAmount:{type:Number,default:0,min:0},branchLocation:String,locationId:{type:mongoose.Schema.Types.ObjectId,ref:'Location'},notes:String,dcNumber:String,poNumber:String,paymentTerms:String,documentName:String},{timestamps:true});
S.pre('validate',function(){
  if(!['Sale','Purchase'].includes(this.type))return;
  const total=Number(this.netTotal),cash=Number(this.paymentSplits?.cash||0),bank=Number(this.paymentSplits?.bank||0),cheque=Number(this.paymentSplits?.cheque||0);
  if(bank+cheque>total)throw Error('Bank and cheque payments cannot exceed transaction total');
  const appliedCash=Math.min(cash,Math.max(0,total-bank-cheque));
  this.changeAmount=Math.max(0,cash+bank+cheque-total);
  this.paymentSplits.cash=appliedCash;
  this.paidAmount=appliedCash+bank+cheque;
  this.remainingUdhaar=Math.max(0,total-this.paidAmount);
});
S.index({date:-1,branchLocation:1});
S.index({partyId:1,date:1,createdAt:1});
S.index({locationId:1,date:-1});
S.index({salesmanId:1,type:1,date:1});
export default mongoose.models.Transaction||mongoose.model('Transaction',S);
