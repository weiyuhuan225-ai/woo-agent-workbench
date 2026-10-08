// Check explicit additions only. This does not validate every number or accounting scope.
export function verifyExplicitSums(text:string){
 const cleaned=text.replace(/\*\*/g,'');
 const pattern=/(\d+(?:\.\d+)?(?:\s*[+＋/、]\s*\d+(?:\.\d+)?){2,})\s*[,，：:]?\s*(?:=|＝|合计|总计)\s*[:：]?\s*(\d+(?:\.\d+)?)/g;
 for(const match of cleaned.matchAll(pattern)){
  const values=match[1].split(/[+＋/、]/).map(Number);
  const actual=values.reduce((sum,value)=>sum+Math.round(value*100),0);
  const claimed=Math.round(Number(match[2])*100);
  if(actual!==claimed)throw new Error('结果中的加总未通过算术检查，未写入内容库。请核对明细后重新运行。');
 }
}
