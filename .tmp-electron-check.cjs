console.log('electron', process.versions.electron);
console.log('type', process.type);
const e = require('electron');
console.log('require electron typeof', typeof e);
console.log('app exists', !!e.app);
