const crypto = require('node:crypto');
const magic = Buffer.from('HOMEBOARD-DB-BACKUP-1\n');
function parseKey(value) {
  const key=Buffer.from(value||'','base64');
  if(key.length!==32)throw new Error('HOMEBOARD_BACKUP_KEY must be a base64-encoded 32-byte key.');
  return key;
}
function seal(data,key) {
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(magic);
  const encrypted=Buffer.concat([cipher.update(data),cipher.final()]);
  return Buffer.concat([magic,iv,cipher.getAuthTag(),encrypted]);
}
function open(data,key) {
  if(data.length<magic.length+28||!data.subarray(0,magic.length).equals(magic))throw new Error('Unsupported backup format.');
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,data.subarray(magic.length,magic.length+12));
  decipher.setAAD(magic);decipher.setAuthTag(data.subarray(magic.length+12,magic.length+28));
  return Buffer.concat([decipher.update(data.subarray(magic.length+28)),decipher.final()]);
}
module.exports={parseKey,seal,open};
