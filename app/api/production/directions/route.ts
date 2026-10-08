import {checkOrigin,failure} from '@/lib/server';
import {createProductionDirections} from '@/lib/production-directions';
export async function POST(req:Request){try{checkOrigin(req);return Response.json(await createProductionDirections(await req.json()))}catch(e){return failure(e)}}
