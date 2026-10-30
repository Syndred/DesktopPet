import { describe, expect, it } from 'vitest';
import { battleRouteId } from '../../../apps/pc-app/ui/src/features/battle/route-id';
describe('battle raw route ID decodes exactly once',()=>{
 for(const prefix of ['/battle/session/','/battle/reports/'] as const){
  it.each([['a%25','a%'],['a%252F','a%2F'],['a%2Fb','a/b'],['%E7%81%B5%E5%AE%A0','灵宠'],['plain-id','plain-id']])(`${prefix}%s`,(encoded,id)=>expect(battleRouteId(`#${prefix}${encoded}`,prefix)).toBe(id));
  it.each(['','%','%GG','%E0%A4%A','extra/segment'])(`${prefix} rejects %s`,encoded=>expect(battleRouteId(`#${prefix}${encoded}`,prefix)).toBeNull());
 }
 it('requires exact endpoint prefix',()=>expect(battleRouteId('#/battle/reports/id','/battle/session/')).toBeNull());
});
