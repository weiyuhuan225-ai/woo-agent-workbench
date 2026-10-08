// JSON whitespace keeps long image requests active without exposing provider data.
// The final JSON carries the original status because headers are already sent.
export function streamJson(work:()=>Promise<Response>):Response {
  const encoder=new TextEncoder();
  let closed=false;
  let timer:ReturnType<typeof setInterval>|undefined;
  const stream=new ReadableStream<Uint8Array>({
    start(controller){
      controller.enqueue(encoder.encode('\n'));
      timer=setInterval(()=>{if(!closed)controller.enqueue(encoder.encode('\n'))},5000);
      work().then(async response=>{
        const data=await response.json() as Record<string,unknown>;
        if(!closed){controller.enqueue(encoder.encode(JSON.stringify({...data,_http_status:response.status})));controller.close();closed=true}
      }).catch(()=>{
        if(!closed){controller.enqueue(encoder.encode(JSON.stringify({error:'任务结果暂未确认，请查询原任务，不要重复生成。',_http_status:503})));controller.close();closed=true}
      }).finally(()=>{if(timer)clearInterval(timer)});
    },
    cancel(){closed=true;if(timer)clearInterval(timer)},
  });
  return new Response(stream,{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, no-transform','X-Accel-Buffering':'no'}});
}
