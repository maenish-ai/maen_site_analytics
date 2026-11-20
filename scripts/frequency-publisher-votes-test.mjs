import assert from 'node:assert/strict';
import { mergeFrequencyData } from '../functions/_lib/frequency-utils.js';

const row = {
  satelliteGroup: 'Nilesat', satelliteName: 'Nilesat 201', orbitalSlot: '7W',
  frequency: '11766', pol: 'H', sr: '27500', system: 'DVB-S2', mod: '8PSK',
  channels: ['Atlas News']
};
const closure = { ...row, channels: [] };

function source(host, { candidates = [], closedCandidates = [], ok = true, complete = false } = {}) {
  const url = `https://${host}/satellite`;
  return {
    source: { ...row, url, minimumCompleteTransponders: complete ? 1 : undefined },
    candidates: candidates.map(candidate => ({ ...candidate, sourceUrl: url, mode: 'baseline-refresh' })),
    closedCandidates, ok
  };
}

function merge(sourceResults) {
  return mergeFrequencyData([row], sourceResults.flatMap(result => result.candidates),
    sourceResults.map(result => result.source), { sourceResults, preserveUnconfirmedChannels: true });
}

const hosts = ['a.test', 'b.test', 'c.test', 'd.test', 'e.test'];
const keep = hosts.map(host => source(host, { candidates: [row] }));
const close = hosts.map(host => source(host, { closedCandidates: [closure] }));

assert.equal(merge([...keep.slice(0, 4), close[4]]).items.length, 1);
assert.equal(merge([...close.slice(0, 3), ...keep.slice(3)]).items.length, 0);
assert.equal(merge([close[0], close[1], source('fr.a.test', { closedCandidates: [closure] }),
  source('c.test', { closedCandidates: [closure], ok: false })]).items.length, 1);

const replacement = { ...row, channels: ['Orion News'] };
const renames = hosts.slice(0, 3).map(host => source(host, { candidates: [replacement], complete: true }));
const renamed = merge([...renames, ...keep.slice(3)]);
assert.deepEqual(renamed.items[0].channels, ['Orion News']);
assert.deepEqual(renamed.items[0].channelAliases['Orion News'], ['Atlas News']);
assert.equal(renamed.renamedChannels.length, 1);

const other = { ...row, frequency: '12000' };
assert.equal(merge(hosts.slice(0, 3).map(host => source(host, { candidates: [other], complete: true }))).removedItems.length, 1);
assert.equal(merge(hosts.slice(0, 3).map(host => source(host, { candidates: [other] }))).removedItems.length, 0);
assert.equal(merge([source('a.test', { candidates: [other] })]).items.length, 1);
assert.equal(merge(hosts.slice(0, 2).map(host => source(host, { candidates: [other] }))).items.length, 2);
assert.equal(merge(hosts.slice(0, 3).map(host => source(host, {
  closedCandidates: [{ ...closure, satelliteName: 'Nilesat 301' }]
}))).items.length, 1);
console.log('Publisher majority, source coverage, and channel rename checks passed.');
