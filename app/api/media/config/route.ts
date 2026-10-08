import {z} from 'zod';
import {publicConfig,saveConfig} from '@/lib/ark';
import {checkOrigin,failure} from '@/lib/server';
const model=z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9._-]+$/);
export async function GET(){try{return Response.json(await publicConfig(),{headers:{'Cache-Control':'no-store'}})}catch(e){return failure(e)}}
export async function POST(req:Request){try{checkOrigin(req);const b=z.object({api_key:z.string().trim().min(10).max(1000).optional(),image_model:model,video_model:model,search_model:model.optional()}).parse(await req.json());return Response.json(await saveConfig(b),{headers:{'Cache-Control':'no-store'}})}catch(e){return failure(e)}}
