'use client';
import {useEffect,useRef,useState} from 'react';
import {Image as ImageIcon,FileText} from 'lucide-react';
import type {ProductionJob} from '@/lib/production-batch';
import {paintProduction} from '@/lib/production-content';
import {readArchivedArtifact} from '@/lib/production-read-client';

// One thumbnail decode at a time, separate from the full review preview.
let rendering=Promise.resolve();
function renderInOrder(task:()=>Promise<void>){const next=rendering.then(task);rendering=next.catch(()=>{});return next}
export default function ProductionThumbnail({projectId,batchId,job,revision=0,active=true}:{projectId:string;batchId:string;job:ProductionJob;revision?:number;active?:boolean}){
 const container=useRef<HTMLSpanElement>(null),canvas=useRef<HTMLCanvasElement>(null),[seen,setSeen]=useState(false),[state,setState]=useState('waiting');
 useEffect(()=>{if(!active||!job.artifact||!job.slot.startsWith('poster-')||seen)return;const node=container.current;if(!node)return;
  if(typeof IntersectionObserver==='undefined'){setSeen(true);return}
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setSeen(true);observer.disconnect()}},{rootMargin:'160px'});observer.observe(node);return()=>observer.disconnect();
 },[active,seen,job.slot,job.artifact?.sha256]);
 useEffect(()=>{if(!active||!seen||!job.artifact||!job.slot.startsWith('poster-'))return;let live=true;const controller=new AbortController();setState('loading');
  readArchivedArtifact(projectId,batchId,job.slot,job.artifact.sha256,revision).then(d=>renderInOrder(async()=>{if(!live||!canvas.current)return;if(!d.artifact.layout)throw Error('预览未就绪');await paintProduction(canvas.current,'/api/files/'+d.artifact.asset_id+'?inline=1',d.artifact.layout,job.review!=='approved',{previewWidth:240,signal:controller.signal});if(live)setState('ready')})).catch(()=>{if(live)setState('error')});
  const node=canvas.current;return()=>{live=false;controller.abort();if(node){node.width=0;node.height=0}};
 },[active,seen,projectId,batchId,job.slot,job.artifact?.sha256,job.review,revision]);
 return <span ref={container} className="production-thumbnail" aria-hidden="true">{job.slot.startsWith('poster-')?<><canvas ref={canvas} hidden={state!=='ready'}/>{state!=='ready'&&<ImageIcon size={24}/>}</>:<FileText size={24}/>}</span>;
}
