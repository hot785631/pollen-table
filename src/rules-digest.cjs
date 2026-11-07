// A balance report is valid only for the same rules and presets bundled into the game.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=()=>{const hash=crypto.createHash('sha256');for(const file of ['engine.js','tuning.js']){
  hash.update(fs.readFileSync(path.join(__dirname,file),'utf8').replace(/\r\n/g,'\n'));hash.update('\0');
}return hash.digest('hex')};
