const numberFormat=new Intl.NumberFormat('en-PK',{useGrouping:true,minimumFractionDigits:2,maximumFractionDigits:2});
/** Display an amount as Pakistani rupees without discarding paisa. */
export function formatPKR(value){const number=Number(value??0);return `PKR ${numberFormat.format(Number.isFinite(number)?number:0)}`;}
