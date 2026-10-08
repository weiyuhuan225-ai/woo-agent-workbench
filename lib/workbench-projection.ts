/** Presentation-only projection. Stored records and default/export reads stay exact. */
export function workbenchRecord<T extends {type:string;data:any}>(record:T):T{
 if(record.type!=='run')return record;
 const {request_contract,project_snapshot,fingerprint,...data}=record.data;
 const sourceMetadata=(sources:any)=>Array.isArray(sources)?sources.map(({text,...source}:any)=>({...source,text_omitted:true})):sources;
 if(data.source_set)data.source_set=sourceMetadata(data.source_set);
 if(data.v2_output?.source_set)data.v2_output={...data.v2_output,source_set:sourceMetadata(data.v2_output.source_set)};
 return {...record,data:{...data,audit_details_omitted:true}};
}
