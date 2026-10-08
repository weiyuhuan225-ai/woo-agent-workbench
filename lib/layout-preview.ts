import type {V2Output} from './v2-contract';

export type LayoutPage={page:number;headline:string;body:string;caption:string;imageRef:string|null};
export const textValue=(v:unknown):string=>typeof v==='string'?v:v==null?'':Array.isArray(v)?v.map(textValue).join('\n'):typeof v==='object'?Object.entries(v).map(([k,x])=>`${k}：${textValue(x)}`).join('\n'):String(v);
export function layoutPages(output:V2Output):LayoutPage[]{
 const s=output.structured_output;
 if(output.agent_key==='graphic'&&Array.isArray(s.pages))return s.pages.map((p:any,i:number)=>({page:i+1,headline:textValue(p.headline),body:textValue(p.body),caption:textValue(p.caption),imageRef:typeof p.image_ref==='string'?p.image_ref:null}));
 if(output.agent_key==='poster'){
  const spec=s.poster_spec as any;
  return [{page:1,headline:output.title,body:textValue(spec?.copy),caption:'文字排版预览 · '+textValue(spec?.size),imageRef:null}];
 }
 return [];
}
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
// Code-native SVG: exact copy is typeset as text. No external URL, generated IP or fake QR.
export function layoutSvg(page:LayoutPage){
 const wrap=(s:string,n:number)=>s.split('\n').flatMap(line=>{const chars=Array.from(line);return chars.length?Array.from({length:Math.ceil(chars.length/n)},(_,i)=>chars.slice(i*n,(i+1)*n).join('')):[''];});
 const title=wrap(page.headline,16),body=wrap(page.body,26),caption=wrap(page.caption,34);
 const titleHeight=title.length*66,bodyY=Math.max(660,220+titleHeight),captionY=bodyY+body.length*48+64;
 const height=Math.max(1440,captionY+caption.length*34+130);
 const lines=(xs:string[],x:number,y:number,size:number,step:number,color:string)=>xs.map((line,i)=>`<text x="${x}" y="${y+i*step}" font-size="${size}" fill="${color}">${escape(line)}</text>`).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}" viewBox="0 0 1080 ${height}" role="img" aria-label="${escape(page.headline)}"><rect width="1080" height="${height}" fill="#fffdf5"/><rect width="1080" height="22" fill="#ffcf37"/><g font-family="sans-serif"><text x="72" y="112" font-size="28" fill="#6a6251">WOO STUDIO / 待人工审核 · ${page.page}</text>${lines(title,72,220,56,66,'#191b20')}<rect x="72" y="${Math.max(340,230+titleHeight)}" width="936" height="240" rx="12" fill="#f1eee4"/><text x="112" y="${Math.max(460,350+titleHeight)}" font-size="32" fill="#746c5b">${page.imageRef?'素材引用待人工核对':'图片 / IP 素材待补齐'}</text>${lines(body,72,bodyY,34,48,'#191b20')}${lines(caption,72,captionY,24,34,'#746c5b')}<text x="72" y="${height-60}" font-size="24" fill="#746c5b">内部文字排版预览 · 非送印文件 · 日期与二维码需审核</text></g></svg>`;
}
