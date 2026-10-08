import {checkOrigin,failure} from '@/lib/server';
import {readBrandProfile,saveBrandProfile} from '@/lib/production-brand';
export async function GET(req:Request){try{return Response.json({profile:await readBrandProfile(new URL(req.url).searchParams.get('project_id')||'')},{headers:{'Cache-Control':'no-store'}})}catch(e){return failure(e)}}
export async function POST(req:Request){try{checkOrigin(req);return Response.json(await saveBrandProfile(await req.json()))}catch(e){return failure(e)}}
