import type {PosterBrief} from './poster-contract';
export function wrapText(ctx:CanvasRenderingContext2D,text:string,width:number){const lines:string[]=[];for(const p of text.split('\n')){let line='';for(const char of Array.from(p)){if(line&&ctx.measureText(line+char).width>width){lines.push(line);line=char}else line+=char}lines.push(line)}return lines}
export async function paintPoster(canvas:HTMLCanvasElement,imageUrl:string,b:PosterBrief,slot:number){
 const sizes:Record<string,[number,number]>={'3:4':[1080,1440],'9:16':[1080,1920],'1:1':[1440,1440],'16:9':[1920,1080]};const [w,h]=sizes[b.ratio];canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');if(!ctx)throw Error('浏览器暂不支持海报预览');
 const image=new Image();image.src=imageUrl;await image.decode();await document.fonts.ready;
 const scale=Math.max(w/image.width,h/image.height);ctx.drawImage(image,(w-image.width*scale)/2,(h-image.height*scale)/2,image.width*scale,image.height*scale);
 const margin=64,textWidth=w-2*margin,ink='#111827',accent=['#ffc42e','#ff6b28','#ffe75b','#f3f5f8'][slot];
 ctx.font='700 68px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';const titles=wrapText(ctx,b.headline,textWidth-36);
 ctx.font='500 30px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';const details=[b.mandatory,...[b.time&&'时间：'+b.time,b.place&&'地点：'+b.place,b.contact&&'联系：'+b.contact].filter(Boolean)].filter(Boolean);const body=details.flatMap(t=>wrapText(ctx,t,textWidth-36));
 const headHeight=titles.length*82+60,footHeight=body.length*42+82;
 if(headHeight+footHeight>h-120)throw Error('文字较多，请选择竖版比例或缩短标题；文字没有被截断。');
 ctx.fillStyle='rgba(255,255,255,.94)';ctx.fillRect(margin-18,margin-20,textWidth+36,headHeight);ctx.fillRect(margin-18,h-footHeight-40,textWidth+36,footHeight);
 ctx.fillStyle=accent;ctx.fillRect(margin-18,margin-20,10,headHeight);ctx.fillRect(margin-18,h-footHeight-40,textWidth+36,8);
 ctx.fillStyle=ink;ctx.font='700 68px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';titles.forEach((t,i)=>ctx.fillText(t,margin,margin+62+i*82));
 ctx.font='500 30px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';body.forEach((t,i)=>ctx.fillText(t,margin,h-footHeight+6+i*42));
 ctx.font='22px sans-serif';ctx.fillStyle='#4b5563';ctx.fillText('AI创作草稿 · 待审核',margin,h-65);
}
