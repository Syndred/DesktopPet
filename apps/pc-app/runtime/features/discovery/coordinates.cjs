// Canonical coordinates are WGS84. Convert only at the map-provider boundary.
const PI = Math.PI;
const {distance}=require('@turf/distance');
function point(value) {
  if (!value || typeof value.lat !== 'number' || typeof value.lng !== 'number' ||
      !Number.isFinite(value.lat) || !Number.isFinite(value.lng) ||
      Math.abs(value.lat) > 90 || Math.abs(value.lng) > 180) {
    throw Object.assign(new Error('位置坐标无效'), { code: 'INVALID_COORDINATES' });
  }
  return { lat: value.lat, lng: value.lng };
}
function inChina(p) { return p.lng >= 72.004 && p.lng <= 137.8347 && p.lat >= 0.8293 && p.lat <= 55.8271; }
function delta(p) {
  const x = p.lng - 105, y = p.lat - 35;
  let lat = -100 + 2*x + 3*y + .2*y*y + .1*x*y + .2*Math.sqrt(Math.abs(x));
  lat += (20*Math.sin(6*x*PI) + 20*Math.sin(2*x*PI))*2/3;
  lat += (20*Math.sin(y*PI) + 40*Math.sin(y/3*PI))*2/3;
  lat += (160*Math.sin(y/12*PI) + 320*Math.sin(y*PI/30))*2/3;
  let lng = 300 + x + 2*y + .1*x*x + .1*x*y + .1*Math.sqrt(Math.abs(x));
  lng += (20*Math.sin(6*x*PI) + 20*Math.sin(2*x*PI))*2/3;
  lng += (20*Math.sin(x*PI) + 40*Math.sin(x/3*PI))*2/3;
  lng += (150*Math.sin(x/12*PI) + 300*Math.sin(x/30*PI))*2/3;
  const rad = p.lat*PI/180, magic = 1 - .00669342162296594323*Math.sin(rad)**2;
  return { lat: lat*180/((6378245*(1-.00669342162296594323))/(magic*Math.sqrt(magic))*PI),
    lng: lng*180/(6378245/Math.sqrt(magic)*Math.cos(rad)*PI) };
}
function wgs84ToGcj02(input) {
  const p = point(input); if (!inChina(p)) return p;
  const d = delta(p); return { lat: p.lat+d.lat, lng: p.lng+d.lng };
}
function gcj02ToWgs84(input) {
  const p = point(input); if (!inChina(p)) return p;
  let guess = { ...p };
  for (let i=0; i<8; i++) {
    const projected = wgs84ToGcj02(guess);
    guess = { lat: guess.lat+p.lat-projected.lat, lng: guess.lng+p.lng-projected.lng };
  }
  return guess;
}
function convertPoint(input, from = 'wgs84', to = 'wgs84') {
  if (!['wgs84','gcj02'].includes(from) || !['wgs84','gcj02'].includes(to)) {
    throw Object.assign(new Error('不支持的坐标系'), { code: 'COORDINATE_SYSTEM_UNSUPPORTED' });
  }
  if (from === to) return point(input);
  return from === 'wgs84' ? wgs84ToGcj02(input) : gcj02ToWgs84(input);
}
function distanceMeters(a, b) {
  a=point(a); b=point(b);
  return distance([a.lng,a.lat],[b.lng,b.lat],{units:'meters'});
}
function checkFix(fix, now = Date.now(), { maxAgeMs = 30000, maxAccuracyMeters = 80 } = {}) {
  if (!fix) return { ok: false, code: 'LOCATION_REQUIRED', message: '请先获取系统位置' };
  if (fix.source !== 'os' || fix.coordinateSystem !== 'wgs84') return { ok: false, code: 'REAL_LOCATION_REQUIRED', message: '演示位置不能用于正式收服' };
  if (fix.positionSource === 'Default') return { ok:false, code:'LOCATION_DEFAULT_POSITION', message:'系统返回了默认位置，无法确认你当前位于附近' };
  try { point(fix); } catch { return { ok:false, code:'INVALID_COORDINATES', message:'系统位置无效' }; }
  if (!Number.isFinite(fix.timestampMs) || now-fix.timestampMs > maxAgeMs || fix.timestampMs-now > 5000) return { ok:false, code:'LOCATION_STALE', message:'位置已过期，请重新定位' };
  if (!Number.isFinite(fix.accuracyMeters) || fix.accuracyMeters <= 0 || fix.accuracyMeters > maxAccuracyMeters) return { ok:false, code:'LOCATION_IMPRECISE', message:`定位精度不足，请移动到信号较好的地方（需要 ≤ ${maxAccuracyMeters} 米）` };
  return { ok:true };
}
function geofence(fix, target, radiusMeters = 100, now = Date.now()) {
  const quality=checkFix(fix, now); if (!quality.ok) return quality;
  const rawDistanceMeters=distanceMeters(fix,target);
  // Preserve the existing LBS rule: half the reported uncertainty, capped at 30m.
  const compensatedDistanceMeters=Math.max(0,rawDistanceMeters-Math.min(30,fix.accuracyMeters*.5));
  return { ok:compensatedDistanceMeters <= radiusMeters, rawDistanceMeters, compensatedDistanceMeters,
    radiusMeters, code:compensatedDistanceMeters <= radiusMeters ? undefined : 'OUT_OF_CAPTURE_RANGE',
    message:compensatedDistanceMeters <= radiusMeters ? undefined : '尚未进入互动范围，请移动到附近' };
}
module.exports={point,convertPoint,wgs84ToGcj02,gcj02ToWgs84,distanceMeters,checkFix,geofence};
