import {failure} from '@/lib/server';
import {publicConfig} from '@/lib/ark';
import {configured} from '@/lib/dify';
export async function GET(){try{const media=await publicConfig();return Response.json({configured:configured(),version:'2.0',capabilities:{search:media.configured,image_generation:media.configured,video_generation:media.configured,pptx_export:true}},{headers:{'Cache-Control':'no-store'}})}catch(e){return failure(e)}}
