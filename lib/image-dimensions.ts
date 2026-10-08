/** Read dimensions from PNG/JPEG bytes without trusting file metadata. */
export function imageDimensions(bytes:Uint8Array){
 const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.length>=24&&bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10'&&String.fromCharCode(...bytes.slice(12,16))==='IHDR')return valid(d.getUint32(16),d.getUint32(20));
 if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216){let pos=2;while(pos+4<=bytes.length){if(bytes[pos++]!==255)break;while(bytes[pos]===255)pos++;const marker=bytes[pos++];if(marker===217||marker===218)break;if(marker===1||marker>=208&&marker<=215)continue;const size=d.getUint16(pos);if(size<2||pos+size>bytes.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&size>=7)return valid(d.getUint16(pos+5),d.getUint16(pos+3));pos+=size;}}
 throw Error('无法从PNG/JPEG原文件读取像素尺寸');
}
function valid(width:number,height:number){if(!width||!height||width>100000||height>100000)throw Error('图片尺寸无效');return {width,height}}
