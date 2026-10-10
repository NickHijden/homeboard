const {test}=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');const {seal,open,parseKey}=require('../scripts/backup-format.cjs');
test('independent archives are authenticated, randomized and decrypt only with the backup key',()=>{
 const key=crypto.randomBytes(32);const data=Buffer.from('PGDMP-synthetic-private-data');const first=seal(data,key),second=seal(data,key);
 assert.notDeepEqual(first,second);assert.equal(first.includes(data),false);assert.deepEqual(open(first,key),data);
 assert.throws(()=>open(first,crypto.randomBytes(32)));const tampered=Buffer.from(first);tampered[tampered.length-1]^=1;assert.throws(()=>open(tampered,key));
 assert.throws(()=>open(first.subarray(0,12),key));assert.deepEqual(parseKey(key.toString('base64')),key);assert.throws(()=>parseKey('too-short'));
});
