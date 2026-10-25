// Protocol fixture for the actual supabase-js SDK. It is not Supabase or cloud/RLS evidence.
const http=require('node:http');
const {createClient}=require('@supabase/supabase-js');
const {BUCKET,TABLE}=require('../cloud-contract.cjs');
async function storageFixture() {
  const state={objects:new Map(),rows:[],requests:[],offline:false,failAfterWrite:false,failDownloadKey:null,corruptDownloadKey:null};
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://fixture'),uid=(req.headers.authorization||'').replace('Bearer fixture-','');
    state.requests.push({method:req.method,path:url.pathname,uid});
    const send=(status,value)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
    if(state.offline)return send(503,{message:'Explicit protocol fixture offline',code:'fixture_offline'});
    const object=/^\/storage\/v1\/object\/(?:authenticated\/)?([^/]+)\/(.+)$/.exec(url.pathname);
    if(object){
      const key=decodeURIComponent(object[2]);
      if(object[1]!==BUCKET||key.split('/')[0]!==uid)return send(403,{statusCode:'403',error:'Unauthorized',message:'Fixture owner boundary'});
      if(req.method==='POST'){
        const parts=[];for await(const part of req)parts.push(part);const bytes=Buffer.concat(parts);
        if(state.objects.has(key))return send(409,{statusCode:'409',error:'Duplicate',message:'The resource already exists'});
        state.objects.set(key,bytes);
        if(state.failAfterWrite){state.failAfterWrite=false;return send(503,{statusCode:'503',message:'Fixture interrupted after storage write'});}
        return send(200,{Key:BUCKET+'/'+key});
      }
      if(req.method==='GET'){
        if(state.failDownloadKey&&key.includes(state.failDownloadKey))return send(503,{statusCode:'503',message:'Fixture download interrupted'});
        let bytes=state.objects.get(key);if(!bytes)return send(404,{statusCode:'404',error:'not_found',message:'Object not found'});
        if(state.corruptDownloadKey&&key.includes(state.corruptDownloadKey)){bytes=Buffer.from(bytes);bytes[0]^=255;}
        res.writeHead(200,{'content-type':'application/octet-stream','content-length':bytes.length});return res.end(bytes);
      }
    }
    if(url.pathname==='/rest/v1/'+TABLE){
      if(req.method==='POST'){
        let raw='';for await(const part of req)raw+=part;const row=JSON.parse(raw);
        if(row.auth_user_id!==uid)return send(403,{code:'42501',message:'Fixture index owner boundary'});
        if(state.rows.some(r=>r.auth_user_id===uid&&r.resource_id===row.resource_id&&r.manifest_sha256===row.manifest_sha256))return send(409,{code:'23505',message:'Fixture duplicate'});
        state.rows.push({...row,created_at:new Date().toISOString()});res.writeHead(201);return res.end();
      }
      if(req.method==='GET'){
        let rows=state.rows.filter(row=>row.auth_user_id===uid);
        for(const [key,value]of url.searchParams){if(value.startsWith('eq.'))rows=rows.filter(row=>String(row[key])===value.slice(3));if(value.startsWith('in.(')){const ids=value.slice(4,-1).split(',');rows=rows.filter(row=>ids.includes(row[key]));}}
        const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||rows.length);
        return send(200,rows.slice(offset,offset+limit));
      }
    }
    return send(404,{message:'Unknown protocol fixture route'});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {state,url:`http://127.0.0.1:${server.address().port}`,
    client(uid,deviceId){return createClient(`http://127.0.0.1:${server.address().port}`,'fixture-publishable',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Authorization:'Bearer fixture-'+uid,'X-Lingjing-Device-Id':deviceId}}});},
    async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
module.exports={storageFixture};
