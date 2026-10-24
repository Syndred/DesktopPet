import { applyCloudCommand, cloudSnapshot, digest, gardenDocument } from '../../../../apps/pc-app/runtime/features/garden/cloud-domain.mjs';
import catalog from '../../../../apps/pc-app/runtime/features/garden/catalog.json' with { type: 'json' };
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,x-client-info,apikey,content-type', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Content-Type': 'application/json; charset=utf-8' };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const errors = {
  SYNC_CONFLICT: '另一台设备已更新存档，请刷新后重试', REVISION_CONFLICT: '菜园或伙伴已更新，请刷新后重试',
  SESSION_INVALIDATED: '云端登录已失效，请重新登录', ACTION_ID_REUSED: '此操作编号已用于另一项操作',
  CLOUD_GARDEN_NOT_INITIALIZED: '请先在账号页面同步包含菜园与伙伴的完整存档'
};
function check(error) { if (error) { const code = Object.keys(errors).find(code => String(error.message).includes(code)); fail(code || 'GARDEN_CLOUD_UNAVAILABLE', errors[code] || '云端菜园服务尚不可用'); } }
export function createGardenHandler(createClient) {
  return async request => {
    if (request.method === 'OPTIONS') return response({ ok: true });
    if (request.method !== 'POST') return response({ ok: false, code: 'METHOD_NOT_ALLOWED', message: '仅支持 POST' }, 405);
    try {
      const raw = await request.text(); if (raw.length > 100000) fail('INVALID_REQUEST', '请求过大');
      const body = JSON.parse(raw); const owner = body.userId, token = body.sessionToken;
      if (typeof owner !== 'string' || typeof token !== 'string' || !token) fail('SESSION_INVALIDATED', errors.SESSION_INVALIDATED);
      const client = createClient();
      const identity = await client.from('runtime_accounts').select('id').eq('id', owner).eq('session_token', token).maybeSingle(); check(identity.error);
      if (!identity.data) fail('SESSION_INVALIDATED', errors.SESSION_INVALIDATED);
      const saved = await client.from('runtime_account_saves').select('revision,envelope').eq('owner_account_id', owner).maybeSingle(); check(saved.error);
      if (!saved.data) fail('CLOUD_GARDEN_NOT_INITIALIZED', errors.CLOUD_GARDEN_NOT_INITIALIZED);
      const envelope = saved.data.envelope;
      const { checksum, ...document } = envelope;
      if (await digest(document) !== checksum) fail('CLOUD_CHECKSUM_MISMATCH', '云端存档校验失败，未修改库存');
      if (body.op === 'snapshot') {
        if (!gardenDocument(envelope,owner).garden_accounts.length) {
          // Empty canonical saves receive the first six plots/seeds on the
          // server. Concurrent first opens share one immutable receipt.
          const input={actionId:'cloud-garden-initialize:v1',expectedRevision:0};
          const requestHash=await digest({kind:'initialize',input});
          const initialized=applyCloudCommand(envelope,owner,'initialize',input,Date.now(),requestHash);
          const {checksum:ignored,...nextDocument}=initialized.envelope;void ignored;
          initialized.envelope.checksum=await digest(nextDocument);
          const committed=await client.rpc('garden_commit_operation',{p_owner:owner,p_session_token:token,p_action_id:input.actionId,p_request_hash:requestHash,p_base_revision:saved.data.revision,p_envelope:initialized.envelope,p_result:initialized.result});check(committed.error);
          const current=await client.from('runtime_account_saves').select('revision,envelope').eq('owner_account_id',owner).maybeSingle();check(current.error);
          if (!current.data) fail('GARDEN_CLOUD_UNAVAILABLE','云端首次菜园尚未读回');
          const {checksum:currentChecksum,...currentDocument}=current.data.envelope;
          if(await digest(currentDocument)!==currentChecksum)fail('CLOUD_CHECKSUM_MISMATCH','云端首次菜园校验失败');
          return response({ok:true,data:{snapshot:cloudSnapshot(current.data.envelope,owner,Date.now()),envelope:current.data.envelope,accountRevision:current.data.revision}});
        }
        return response({ ok: true, data: { snapshot: cloudSnapshot(envelope, owner, Date.now()), envelope, accountRevision: saved.data.revision } });
      }
      let command = body.command, input = body.input, reward;
      if (body.op === 'claimReward') {
        if (!['battle','exploration'].includes(body.source) || typeof body.receiptId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.receiptId)) fail('UNVERIFIED_REWARD', '种子凭据无效');
        const sourceTable = body.source === 'battle' ? 'runtime_battle_settlements' : 'runtime_discovery_captures';
        const proof = await client.from(sourceTable).select('*').eq('owner_account_id',owner).eq(body.source === 'battle' ? 'room_id' : 'id',body.receiptId).maybeSingle(); check(proof.error);
        if (!proof.data) fail('UNVERIFIED_REWARD','需要已经结算且属于当前账号的服务端记录');
        if (gardenDocument(envelope,owner).garden_reward_receipts.some(row => row.source === body.source && row.receipt_id === body.receiptId)) return response({ok:true,data:{claimed:true,alreadyClaimed:true}});
        const seedHash = await digest({source:body.source,receipt:body.receiptId});
        reward = {ownerAccountId:owner,id:body.receiptId,source:body.source,cropId:Object.keys(catalog.CROPS)[parseInt(seedHash.slice(0,8),16)%4]};
        command='reward';input={actionId:`cloud-seeds:${body.source}:${body.receiptId}`,source:body.source,receiptId:body.receiptId};
      } else if (body.op !== 'command' || !['plant','harvest','craft','feed'].includes(command)) fail('CLOUD_COMMAND_UNAVAILABLE', '该操作尚未接入云端权威结算');
      if(!input || typeof input!=='object' || Array.isArray(input) || typeof input.actionId!=='string' || !/^[a-zA-Z0-9:_-]{1,160}$/.test(input.actionId)) fail('INVALID_ACTION','操作编号无效');
      const requestHash = await digest({ kind: command, input });
      const existing = await client.from('runtime_garden_operations').select('request_hash,response_json').eq('owner_account_id', owner).eq('action_id', input?.actionId).maybeSingle(); check(existing.error);
      if (existing.data) {
        if (existing.data.request_hash !== requestHash) fail('ACTION_ID_REUSED', errors.ACTION_ID_REUSED);
        return response({ ok: true, data: { ...existing.data.response_json, replayed: true } });
      }
      const applied = applyCloudCommand(envelope, owner, command, input, Date.now(), requestHash,undefined,reward);
      if (!applied.changed) return response({ ok: true, data: { actionId: input.actionId, requestHash, accountRevision: saved.data.revision, result: applied.result, replayed: true } });
      const { checksum: ignored, ...nextDocument } = applied.envelope; void ignored;
      applied.envelope.checksum = await digest(nextDocument);
      const committed = await client.rpc('garden_commit_operation', { p_owner: owner, p_session_token: token, p_action_id: input.actionId, p_request_hash: requestHash, p_base_revision: saved.data.revision, p_envelope: applied.envelope, p_result: applied.result }); check(committed.error);
      return response({ ok: true, data: committed.data });
    } catch (error) {
      const code = error.code || 'INVALID_REQUEST';
      return response({ ok: false, code, message: errors[code] || (error.code ? error.message : '请求格式无效') }, code === 'SESSION_INVALIDATED' ? 401 : /CONFLICT|REUSED/.test(code) ? 409 : /UNAVAILABLE/.test(code) ? 503 : 400);
    }
  };
}
