const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const {execFileSync}=require('node:child_process');const {seal}=require('../scripts/backup-format.cjs');
test('an encrypted synthetic database archive restores into an isolated temporary database', {timeout:90000}, async t=>{
 const container='homeboard-backup-fixture-'+process.pid;const root=path.resolve(__dirname,'..');const file=path.join(root,'tmp','synthetic-restore-'+process.pid+'.pgdump.enc');const key=crypto.randomBytes(32);
 execFileSync('docker',['run','--detach','--rm','--pull=never','--network','none','--name',container,'-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:16-alpine'],{stdio:'pipe'});
 t.after(()=>{execFileSync('docker',['rm','-f',container],{stdio:'pipe'});fs.rmSync(file,{force:true});});
 execFileSync('docker',['exec',container,'sh','-c','until pg_isready -U postgres >/dev/null; do sleep 1; done'],{stdio:'pipe',timeout:30000});
 execFileSync('docker',['exec',container,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-c',"create schema auth; create table auth.users(id text primary key); insert into auth.users values('synthetic'); create table public.household_documents(household_id text primary key,data jsonb); insert into public.household_documents values('synthetic','{\"tasks\":[]}');"],{stdio:'pipe'});
 const archive=execFileSync('docker',['exec',container,'pg_dump','-U','postgres','--format=custom','--no-owner','--no-acl'],{stdio:['pipe','pipe','pipe']});
 fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,seal(archive,key));const result=execFileSync(process.execPath,[path.join(root,'scripts/restore-backup-check.cjs'),file],{env:{...process.env,HOMEBOARD_BACKUP_KEY:key.toString('base64')},encoding:'utf8'});
 assert.match(result,/restoration and core table checks passed/);
 assert.throws(()=>execFileSync(process.execPath,[path.join(root,'scripts/restore-backup-check.cjs'),file],{env:{...process.env,HOMEBOARD_BACKUP_KEY:crypto.randomBytes(32).toString('base64')},stdio:'pipe'}));
});
