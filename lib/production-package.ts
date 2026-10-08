/** ZIP store mode: bounded delivery files, no runtime dependency or network. */
export function deliveryZip(files:{name:string;bytes:Uint8Array}[]){
 const enc=new TextEncoder(),chunks:Uint8Array[]=[],central:Uint8Array[]=[];let offset=0,total=0;
 const crc=(a:Uint8Array)=>{let c=0xffffffff;for(const b of a){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^0xffffffff)>>>0};
 const header=(length:number)=>{const bytes=new Uint8Array(length);return {bytes,view:new DataView(bytes.buffer)}};
 for(const file of files){if(!/^[\w./-]+$/.test(file.name)||file.name.includes('..'))throw Error('交付文件名无效');total+=file.bytes.length;if(total>120*1024*1024)throw Error('交付包超过120MB，请分别下载。');const name=enc.encode(file.name),sum=crc(file.bytes),l=header(30+name.length);l.view.setUint32(0,0x04034b50,true);l.view.setUint16(4,20,true);l.view.setUint32(14,sum,true);l.view.setUint32(18,file.bytes.length,true);l.view.setUint32(22,file.bytes.length,true);l.view.setUint16(26,name.length,true);l.bytes.set(name,30);chunks.push(l.bytes,file.bytes);
 const c=header(46+name.length);c.view.setUint32(0,0x02014b50,true);c.view.setUint16(4,20,true);c.view.setUint16(6,20,true);c.view.setUint32(16,sum,true);c.view.setUint32(20,file.bytes.length,true);c.view.setUint32(24,file.bytes.length,true);c.view.setUint16(28,name.length,true);c.view.setUint32(42,offset,true);c.bytes.set(name,46);central.push(c.bytes);offset+=l.bytes.length+file.bytes.length;
 }
 const size=central.reduce((n,c)=>n+c.length,0),end=header(22);end.view.setUint32(0,0x06054b50,true);end.view.setUint16(8,files.length,true);end.view.setUint16(10,files.length,true);end.view.setUint32(12,size,true);end.view.setUint32(16,offset,true);return new Blob([...chunks,...central,end.bytes] as BlobPart[],{type:'application/zip'});
}

/** Read only the bounded, uncompressed archive format produced above. */
export function readDeliveryZip(bytes:Uint8Array,maxFiles=25){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),decoder=new TextDecoder(),files=new Map<string,Uint8Array>(),local=new Map<string,{offset:number;size:number;crc:number}>();let offset=0;
 while(offset+4<=bytes.length&&view.getUint32(offset,true)===0x04034b50){
  if(offset+30>bytes.length||files.size>=maxFiles)throw Error('交付包结构无效');
  const flags=view.getUint16(offset+6,true),method=view.getUint16(offset+8,true),size=view.getUint32(offset+18,true),rawSize=view.getUint32(offset+22,true),nameLength=view.getUint16(offset+26,true),extra=view.getUint16(offset+28,true),start=offset+30+nameLength+extra,end=start+size;
  if(flags!==0||method!==0||size!==rawSize||end>bytes.length||extra!==0)throw Error('交付包格式不受支持');
  const name=decoder.decode(bytes.subarray(offset+30,offset+30+nameLength));if(!/^[\w./-]+$/.test(name)||name.includes('..')||files.has(name))throw Error('交付文件名无效或重复');
  files.set(name,bytes.slice(start,end));local.set(name,{offset,size,crc:view.getUint32(offset+14,true)});offset=end;
 }
 const centralOffset=offset,centralSeen=new Set<string>();let centralCount=0;
 while(offset+46<=bytes.length&&view.getUint32(offset,true)===0x02014b50){const n=view.getUint16(offset+28,true),extra=view.getUint16(offset+30,true),comment=view.getUint16(offset+32,true),end=offset+46+n+extra+comment;if(end>bytes.length)throw Error('交付包目录无效');const name=decoder.decode(bytes.subarray(offset+46,offset+46+n)),entry=local.get(name);if(!entry||centralSeen.has(name)||extra!==0||comment!==0||view.getUint16(offset+8,true)!==0||view.getUint16(offset+10,true)!==0||view.getUint32(offset+42,true)!==entry.offset||view.getUint32(offset+20,true)!==entry.size||view.getUint32(offset+24,true)!==entry.size||view.getUint32(offset+16,true)!==entry.crc)throw Error('交付包目录与文件不一致');centralSeen.add(name);offset=end;centralCount++;if(centralCount>maxFiles||offset>bytes.length)throw Error('交付包目录无效')}
 if(offset+22!==bytes.length||view.getUint32(offset,true)!==0x06054b50||view.getUint16(offset+10,true)!==files.size||centralCount!==files.size||view.getUint32(offset+16,true)!==centralOffset||view.getUint32(offset+12,true)!==offset-centralOffset)throw Error('交付包不完整');
 return files;
}
