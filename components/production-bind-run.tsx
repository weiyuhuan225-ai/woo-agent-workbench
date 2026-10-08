'use client';
import {useState} from 'react';
export default function ProductionBindRun({onBind,disabled}:{onBind:(id:string)=>Promise<void>;disabled:boolean}){const [id,setId]=useState('');return <label className="field"><span>在 Dify 日志核对到的原运行 UUID</span><input value={id} onChange={e=>setId(e.target.value)} placeholder="原 workflow_run_id"/><button className="secondary" disabled={disabled||!/^[a-f0-9-]{36}$/i.test(id)} onClick={()=>onBind(id)}>校验输入并绑定原运行</button></label>}
