// Main-only acceptance hook; load the exact production TypeScript-built entry.
// This file is excluded from all release packages and creates no renderer IPC.
const {resolve}=require('node:path');
globalThis.__accountsCloudAcceptanceRequire=require;
const servicesModule=require('../../../core/services.cjs'),nativeCreate=servicesModule.createServices;
servicesModule.createServices=options=>{
 const services=nativeCreate(options);globalThis.__accountsCloudAcceptanceServices=services;return services;
};
require(resolve(__dirname,'../../../../dist/main/index.cjs'));
