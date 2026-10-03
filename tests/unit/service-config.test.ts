import assert from 'node:assert/strict';
import test from 'node:test';
import { configFromEnv } from '../../services/research/server.ts';
import { JobStore } from '../../services/research/store.ts';

test('service uses the hosting port, with explicit research port taking precedence', () => {
  const previous = { ...process.env };
  try {
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017';
    process.env.RESEARCH_SERVICE_SECRET = 'fictional-test-secret-at-least-32-characters';
    delete process.env.RESEARCH_PORT;
    delete process.env.PORT;
    assert.equal(configFromEnv().port, 8788);
    process.env.PORT = '9000';
    assert.equal(configFromEnv().port, 9000);
    process.env.RESEARCH_PORT = '8789';
    assert.equal(configFromEnv().port, 8789);
    delete process.env.RESEARCH_PORT;
    process.env.PORT = 'not-a-port';
    assert.throws(configFromEnv, /Invalid service configuration/);
  } finally { process.env = previous; }
});

test('acceptance stores cannot address the default collections through a chosen prefix', async () => {
  const uri = 'mongodb://127.0.0.1:27017', prefix = 'acceptance_' + 'a'.repeat(32) + '_';
  const main = new JobStore(uri, 'marketlab'), isolated = new JobStore(uri, 'marketlab', prefix);
  try {
    assert.equal(main.jobs.collectionName, 'research_jobs');
    assert.equal(main.nonces.collectionName, 'request_nonces');
    assert.equal(isolated.jobs.collectionName, prefix + 'research_jobs');
    assert.equal(isolated.nonces.collectionName, prefix + 'request_nonces');
    for (const value of ['research_jobs', '../', 'acceptance_short_', 'acceptance_' + 'a'.repeat(32)]) assert.throws(() => new JobStore(uri, 'marketlab', value), /Invalid acceptance/);
  } finally { await main.close(); await isolated.close(); }
});

test('active admission has conservative defaults and rejects invalid configured limits',()=>{
  const previous={...process.env};
  try{
    process.env.MONGODB_URI='mongodb://127.0.0.1:27017';process.env.RESEARCH_SERVICE_SECRET='fictional-test-secret-at-least-32-characters';delete process.env.PORT;delete process.env.RESEARCH_PORT;delete process.env.RESEARCH_ACTIVE_LIMIT;delete process.env.RESEARCH_OWNER_ACTIVE_LIMIT;
    assert.deepEqual(configFromEnv().admission,{global:64,perOwner:4});
    for(const [global,owner] of [['0','4'],['257','4'],['64','31'],['2','4'],['NaN','4']]){process.env.RESEARCH_ACTIVE_LIMIT=global;process.env.RESEARCH_OWNER_ACTIVE_LIMIT=owner;assert.throws(configFromEnv,/admission limits/);}
  }finally{process.env=previous;}
});
