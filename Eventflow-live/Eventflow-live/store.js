
const fs = require('fs');
const path = require('path');
const DATA_DIR = path.join(__dirname, 'data');
const files = {
  users: path.join(DATA_DIR, 'users.json'),
  suppliers: path.join(DATA_DIR, 'suppliers.json'),
  packages: path.join(DATA_DIR, 'packages.json'),
  plans: path.join(DATA_DIR, 'plans.json'),
  notes: path.join(DATA_DIR, 'notes.json'),
  messages: path.join(DATA_DIR, 'messages.json'),
  threads: path.join(DATA_DIR, 'threads.json'),
  events: path.join(DATA_DIR, 'events.json')
};
function ensure(){ if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR,{recursive:true}); for(const k of Object.keys(files)){ if(!fs.existsSync(files[k])) fs.writeFileSync(files[k], '[]', 'utf8'); } }
function read(name){ ensure(); try{ return JSON.parse(fs.readFileSync(files[name],'utf8')||'[]'); }catch(_){ return []; } }
function write(name, data){ ensure(); fs.writeFileSync(files[name], JSON.stringify(data, null, 2), 'utf8'); }
function uid(prefix='id'){ const s=Math.random().toString(36).slice(2,8)+Date.now().toString(36).slice(2); return `${prefix}_${s}`; }
module.exports = { read, write, uid, DATA_DIR };
