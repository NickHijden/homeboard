const {test}=require('node:test');const assert=require('node:assert/strict');
const p=require('../planner-features.js');
test('four weeks means 28 days while calendar months clamp safely',()=>{
  const date=p.parseDate('2026-01-31');
  assert.equal(p.key(p.nextDate(date,'fourweekly')),'2026-02-28');
  assert.equal(p.key(p.nextDate(p.parseDate('2026-03-01'),'fourweekly')),'2026-03-29');
  assert.equal(p.key(p.nextDate(p.parseDate('2026-03-01'),'monthly')),'2026-04-01');
  assert.equal(p.key(p.nextDate(date,'quarterly')),'2026-04-30');
  assert.equal(p.parseDate('2026-02-30'),null);assert.equal(p.parseDate('2026-13-01'),null);
});
test('rotating recurring assignments are stable per occurrence, with Together separate',()=>{
  const profile={members:[{id:'me',name:'Alex'},{id:'partner',name:'Taylor'},{id:'third',name:'Sam'}]};
  const task={assignee:'me',rotate:true,recurrence:'weekly',rotationAnchor:'2026-10-05'};
  for(const [date,id] of [['2026-10-05','me'],['2026-10-12','partner'],['2026-10-19','third'],['2026-10-26','me']])assert.equal(p.assignee(task,profile,date),id);
  assert.equal(p.assignee({...task,rotate:false,assignee:'both'},profile,'2026-10-12'),'both');
  assert.equal(p.label('both',profile),'Together');assert.equal(p.label('gone',profile),'Former member');
});
test('profile reconciliation preserves stable IDs and chooses the newer names',()=>{
  const old={updatedAt:'2026-10-01',members:[{id:'me',name:'Before'}]};
  const recent={updatedAt:'2026-10-02',members:[{id:'me',name:'After'}]};
  assert.equal(p.newerProfile(old,recent),recent);
  assert.deepEqual(p.members({members:[{id:'me',name:'Alex'},{id:'me',name:'Duplicate'},{id:'both',name:'Wrong'},{id:'<img>',name:'Unsafe'}]}),[{id:'me',name:'Alex'}]);
});
test('quiet evening boundaries support an overnight interval',()=>{
  assert.equal(p.quietAt('21:00','21:00','07:00'),true);assert.equal(p.quietAt('06:59','21:00','07:00'),true);
  assert.equal(p.quietAt('07:00','21:00','07:00'),false);assert.equal(p.quietAt('15:00','21:00','07:00'),false);
  assert.equal(p.quietAt('12:00','12:00','12:00'),false);
});
