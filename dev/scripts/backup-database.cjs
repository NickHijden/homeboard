// Operator/CI command. Secrets are environment variables, never CLI arguments.
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const {spawnSync}=require('node:child_process');
const {parseKey,seal,open}=require('./backup-format.cjs');
function main() {
  const key=parseKey(process.env.HOMEBOARD_BACKUP_KEY);
  const source=new URL(process.env.HOMEBOARD_DB_URL||'');
  const project=process.env.HOMEBOARD_BACKUP_PROJECT;
  if(!project||!['postgres:','postgresql:'].includes(source.protocol))throw new Error('Set HOMEBOARD_DB_URL and HOMEBOARD_BACKUP_PROJECT.');
  if(!source.hostname.includes(project)&&!decodeURIComponent(source.username).includes(project))throw new Error('The database connection does not match HOMEBOARD_BACKUP_PROJECT.');
  const output=path.resolve(process.env.HOMEBOARD_BACKUP_DIR||'.db-backups');fs.mkdirSync(output,{recursive:true});
  const env={...process.env,PGHOST:source.hostname,PGPORT:source.port||'5432',PGUSER:decodeURIComponent(source.username),PGPASSWORD:decodeURIComponent(source.password),PGDATABASE:source.pathname.slice(1)||'postgres',PGSSLMODE:'require'};
  const result=spawnSync(process.env.HOMEBOARD_PG_DUMP||'pg_dump',['--format=custom','--no-owner','--no-acl'],{env,encoding:null,maxBuffer:512*1024*1024});
  if(result.error||result.status!==0)throw new Error('Database backup failed. Check connectivity and pg_dump; no archive was published.');
  if(!result.stdout.subarray(0,5).equals(Buffer.from('PGDMP')))throw new Error('pg_dump did not return a valid custom archive.');
  const encrypted=seal(result.stdout,key);
  if(!open(encrypted,key).equals(result.stdout))throw new Error('Backup encryption round-trip failed.');
  const file=path.join(output,'homeboard-'+project+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'.pgdump.enc');
  fs.writeFileSync(file,encrypted,{mode:0o600,flag:'wx'});
  fs.writeFileSync(file+'.sha256',crypto.createHash('sha256').update(encrypted).digest('hex')+'\n',{mode:0o600,flag:'wx'});
  console.log('Encrypted database archive and checksum created. Store the backup key separately.');
}
try{main();}catch(error){console.error(error.message);process.exitCode=1;}
