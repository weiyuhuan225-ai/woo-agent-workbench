import {database,HttpError} from './server';
export async function activityRecord(project:string){const r=await database().prepare("SELECT * FROM records WHERE project_id=? AND type='activity_settings'").bind(project).first<any>();return r?{...r,data:JSON.parse(r.data)}:null}
export async function validateActivity(project:string,revision:number){const r=await activityRecord(project);if((r?.revision||0)!==revision)throw new HttpError(409,'活动信息已修改，请刷新并核对本次创作内容');return r}
