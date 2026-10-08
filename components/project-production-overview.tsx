'use client';
import {useEffect,useState} from 'react';
import {Image as ImageIcon,FileText,Clapperboard,AlertCircle} from 'lucide-react';
import type {Project,Item} from '@/lib/model';
import type {ProductionBatch} from '@/lib/production-batch';
import {productionAttention} from '@/lib/production-attention';
import {copyPlatforms} from '@/lib/copywriting';
import ProductionThumbnail from './production-thumbnail';

export default function ProjectProductionOverview({project,items,onOpen}:{project:Project;items:Item[];onOpen:()=>void}){
 const [batches,setBatches]=useState<ProductionBatch[]>([]),[brandAvailable,setBrandAvailable]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{let active=true;setLoading(true);setError('');setBatches([]);Promise.all([fetch('/api/production?project_id='+encodeURIComponent(project.id)),fetch('/api/posters/ip?project_id='+encodeURIComponent(project.id))]).then(async rs=>{const [p,a]=await Promise.all(rs.map(async r=>{const d:any=await r.json();if(!r.ok)throw Error(d.error||'生产状态读取失败');return d}));if(active){setBatches(p.batches.map((v:any)=>v.data));setBrandAvailable(a.assets.length>0)}}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[project.id,items]);
 const attention=productionAttention(items,batches,brandAvailable),latest=batches[0],works=latest?.jobs.filter(j=>/^(poster-[1-4]|copy-)/.test(j.slot))||[],ready=works.filter(j=>j.state==='succeeded'),approved=works.filter(j=>j.review==='approved'),stale=!!latest&&latest.input.activity_revision!==items.find(i=>i.type==='activity_settings')?.revision;
 return <section className="overview-production" aria-label="当前制作与待处理事项">
  <section className="panel production-glance"><div className="section-heading"><div><span className="section-kicker">当前制作</span><h2>{loading?'读取生产状态…':latest?.input.approved_brief.theme||'开始本次创作'}</h2></div><button className="primary" onClick={onOpen}>{latest?'打开制作工作台':'准备创作简报'}</button></div>
   {error?<p className="form-error" role="alert"><AlertCircle size={16}/>{error}。进入工作台后可刷新状态。</p>:loading?<p role="status" className="muted">正在读取已保存的批次与审核记录。</p>:<>
    {stale&&<p className="form-error">活动事实已更新；以下为原批作品，需修订并重新核对。</p>}<div className="production-glance-stats"><span><ImageIcon size={17}/>海报 {works.filter(j=>j.slot.startsWith('poster')&&j.state==='succeeded').length}/4 已归档</span><span><FileText size={17}/>文案 {works.filter(j=>j.slot.startsWith('copy')&&j.state==='succeeded').length}/4 已归档</span><span>{approved.length} 项{stale?'原批已批准':'已批准'}</span></div>
    {ready.length?<div className="recent-production-grid">{ready.slice(0,4).map(j=><button className="recent-production-item" key={j.slot} onClick={onOpen}><ProductionThumbnail projectId={project.id} batchId={latest!.id} job={j}/><span><strong>{j.slot.startsWith('poster')?'海报 '+j.slot.slice(7):copyPlatforms[j.slot.slice(5) as keyof typeof copyPlatforms]}</strong><small>{j.review==='approved'?'已批准':j.review==='rejected'?'已退回':'待审核'}</small></span></button>)}</div>:<div className="production-empty"><ImageIcon size={30}/><p>{latest?'批次已保存，归档后的作品会显示在这里。':'先确认活动事实、品牌参考和创作方向，再开始制作。'}</p></div>}
    <p className="context-note">作品归档与审核状态来自当前批次；实际发布另行记录。</p>
   </>}
  </section>
  <section className="panel attention-glance"><div className="section-heading"><h2>待我处理</h2><span className="count-chip">{loading?'…':error?'—':attention.length}</span></div>{!loading&&!error&&<>{attention.slice(0,4).map(a=><button className="attention-link" key={a.id} onClick={onOpen}><AlertCircle size={17}/><span>{a.title}</span></button>)}{!attention.length&&<p className="muted">当前没有待处理提醒。继续查看执行与发布记录。</p>}</>}{loading&&<p className="muted">正在核对事实、作品和执行准备。</p>}<div className="overview-shortcuts"><button className="secondary" onClick={onOpen}><Clapperboard size={16}/>制作与审核</button></div></section>
 </section>;
}
