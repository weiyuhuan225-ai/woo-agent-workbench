import {closeoutEvents} from '@/lib/closeout-baseline';
export default function CloseoutOverview(){return <section className="panel closeout-overview"><h2>演示归档与来源核对</h2><p>本公开版使用虚构案例，不包含原项目成果、照片和费用。</p>{closeoutEvents.map(e=><article key={e.id}><h3>{e.title}</h3><p>{e.detail}</p></article>)}<a href="/reference/demo-closeout.html" target="_blank" rel="noreferrer">查看合成资料</a></section>}
