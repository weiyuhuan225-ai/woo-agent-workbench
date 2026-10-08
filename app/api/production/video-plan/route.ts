import {checkOrigin,failure} from '@/lib/server';
import {saveVideoPlan} from '@/lib/production-video';
export async function POST(req:Request){try{checkOrigin(req);return Response.json(await saveVideoPlan(await req.json()))}catch(e){return failure(e)}}
