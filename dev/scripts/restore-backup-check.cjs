// Restore only into a newly created, network-isolated local database container.
const fs=require('node:fs');const {execFileSync}=require('node:child_process');const {parseKey,open}=require('./backup-format.cjs');
const file=process.argv[2];
if(!file){console.error('Provide an encrypted database archive path.');process.exit(1);}
const container='homeboard-restore-check-'+process.pid+'-'+Date.now();let started=false;
try{
  const dump=open(fs.readFileSync(file),parseKey(process.env.HOMEBOARD_BACKUP_KEY));
  if(dump.subarray(0,5).toString()!=='PGDMP')throw Error('Invalid database archive.');
  execFileSync('docker',['run','--detach','--rm','--pull=never','--network','none','--name',container,'-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:16-alpine'],{stdio:'pipe'});started=true;
  execFileSync('docker',['exec',container,'sh','-c','until pg_isready -U postgres >/dev/null; do sleep 1; done'],{stdio:'pipe',timeout:30000});
  execFileSync('docker',['exec',container,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-c','create role anon; create role authenticated; create role service_role;'],{stdio:'pipe'});
  // A Supabase archive requiring managed extensions must use a matching local
  // Supabase stack. Fail explicitly on any restore error; never ignore it.
  execFileSync('docker',['exec','-i',container,'pg_restore','-U','postgres','--dbname=postgres','--no-owner','--no-acl','--exit-on-error'],{input:dump,stdio:['pipe','pipe','pipe'],maxBuffer:16*1024*1024});
  execFileSync('docker',['exec',container,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-c',"select count(*) from public.household_documents; select count(*) from auth.users;"],{stdio:'pipe'});
  console.log('Isolated database restoration and core table checks passed. The temporary database has been removed.');
}catch(error){console.error('Restore rehearsal failed; no live database was modified. A compatible schema and Supabase extensions may be required.');process.exitCode=1;}
finally{if(started)execFileSync('docker',['rm','-f',container],{stdio:'pipe'});}
