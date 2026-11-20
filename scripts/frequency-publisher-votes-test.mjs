import assert from 'node:assert/strict';
import { alignPublisherListings, extractCandidatesFromHtml, extractKingOfSatListings, extractChannelAccessObservations, mergeFrequencyData, validateFrequencyCoverage } from '../functions/_lib/frequency-utils.js';

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

function merge(sourceResults, baseline = [row]) {
  return mergeFrequencyData(baseline, sourceResults.flatMap(result => result.candidates),
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

const rowWithNeighbor = { ...row, channels: ['Atlas News', 'Local Radio'] };
const replacementWithNeighbor = { ...row, channels: ['Orion News', 'Local Radio'] };
const shared = merge(
  hosts.slice(0, 3).map(host => source(host, { candidates: [replacementWithNeighbor], complete: true })),
  [rowWithNeighbor]
);
assert.deepEqual(shared.items[0].channels, ['Local Radio', 'Orion News']);
assert.deepEqual(shared.items[0].channelAliases['Orion News'], ['Atlas News']);

const other = { ...row, frequency: '12000' };
assert.equal(merge(hosts.slice(0, 3).map(host => source(host, { candidates: [other], complete: true }))).removedItems.length, 1);
assert.equal(merge(hosts.slice(0, 3).map(host => source(host, { candidates: [other] }))).removedItems.length, 0);
assert.equal(merge([source('a.test', { candidates: [other] })]).items.length, 1);
assert.equal(merge(hosts.slice(0, 2).map(host => source(host, { candidates: [other] }))).items.length, 2);
assert.equal(merge(hosts.slice(0, 3).map(host => source(host, {
  closedCandidates: [{ ...closure, satelliteName: 'Nilesat 301' }]
}))).items.length, 1);
const confirmedRemoval = merge([...close.slice(0, 3), ...keep.slice(3)]);
assert.doesNotThrow(() => validateFrequencyCoverage([row], confirmedRemoval.items, confirmedRemoval.removedItems));
assert.throws(() => validateFrequencyCoverage([row], [], []), /Nilesat 201: 1/);
assert.throws(() => validateFrequencyCoverage([row], [], [{ ...row, removedReason: 'publisher-majority', closedSourceCount: 2 }]), /Refusing to publish/);
console.log('Publisher majority, source coverage, and channel rename checks passed.');

const accessTable = `<table>
<tr><th>Channel Name</th><th>Frequency Polarity</th><th>Symbol Rate FEC</th><th>System Encryption</th></tr>
<tr><td>Atlas News</td><td>11766 H</td><td>27500 3/4</td><td>DVB-S2 Clear</td></tr>
<tr><td>Local Radio</td><td>11766 H</td><td>27500 3/4</td><td>Viaccess</td></tr>
<tr><td>Other</td><td>11766 H</td><td>27500 3/4</td><td>DVB-S2</td></tr>
<tr><td>Ambiguous</td><td>11766 H</td><td>27500 3/4</td><td>FTA / Encrypted</td></tr>
</table>`;
const mixedCatalog = [{ ...rowWithNeighbor, channelEncryption: { 'Atlas News': 'encrypted' } }];
function accessSource(host, html = accessTable) {
  const result = source(host, { candidates: [rowWithNeighbor] });
  return { ...result, accessObservations: extractChannelAccessObservations(html, result.source) };
}
const accessA = accessSource('a.test');
const accessB = accessSource('b.test');
assert.deepEqual(accessA.accessObservations.map(x => [x.channel, x.status]), [
  ['Atlas News', 'free'], ['Local Radio', 'encrypted']
]);
assert.equal(merge([accessA, accessSource('fr.a.test')], mixedCatalog).items[0].channelEncryption['Atlas News'], 'encrypted');
const updatedAccess = merge([accessA, accessB], mixedCatalog);
assert.deepEqual(updatedAccess.items[0].channelEncryption, { 'Atlas News': 'free', 'Local Radio': 'encrypted' });
const conflict = merge([accessA, accessSource('b.test', accessTable.replace('DVB-S2 Clear', 'Encrypted'))], mixedCatalog);
assert.equal(conflict.items[0].channelEncryption['Atlas News'], 'unknown');
assert.equal(conflict.channelAccess.conflicts.length, 1);
const wrongFrequency = accessTable.replaceAll('11766 H', '11766 V');
assert.equal(merge([accessA, accessSource('b.test', wrongFrequency)], mixedCatalog).items[0].channelEncryption['Atlas News'], 'encrypted');
console.log('Per-channel access parsing, independent evidence, and conflicts passed.');

const newTuning = { ...row, frequency: '11223' };
const oldTuningWithRemainingStation = { ...row, channels: ['Local Radio'] };
const moveReports = hosts.slice(0, 3).map(host => source(host, {
  candidates: [oldTuningWithRemainingStation, newTuning], complete: true
}));
const moved = merge([...moveReports, ...keep.slice(3)], [rowWithNeighbor]);
assert.equal(moved.movedChannels.length, 1);
assert.deepEqual(moved.items.find(item => item.frequency === '11766').channels, ['Local Radio']);
assert.deepEqual(moved.items.find(item => item.frequency === '11223').channels, ['Atlas News']);
assert.equal(moved.coverage[0].frequencies, 1);
assert.equal(moved.coverage[0].channelEntries, 2);
assert.equal(moved.coverage[0].completePublishers.length, 3);
const simultaneous = merge([...moveReports.slice(0, 2), ...keep.slice(2)], [rowWithNeighbor]);
assert.equal(simultaneous.movedChannels.length, 0);
assert(simultaneous.items.find(item => item.frequency === '11766').channels.includes('Atlas News'));
console.log('Station move, simulcast protection, and catalog coverage passed.');

const frequencyBlocks = `<p>11977 V</p><p>DVB-S2 8PSK 27500 3/4</p>
<p>Atlas News MPEG-4</p><p>Service ID 12345</p><p>2026</p>
<p>12015 V</p><p>DVB-S2</p><p>Local Radio MPEG-4</p><p>2025</p>`;
const extracted = extractCandidatesFromHtml(frequencyBlocks, source('a.test').source);
assert.deepEqual(extracted.map(item => [item.frequency, item.sr]), [['11977', '27500'], ['12015', '']]);
console.log('Tuning extraction ignores service identifiers and years.');

const explicitTuning = `<table><tr><th>Service Name</th><th>Frequency</th><th>Polarity</th><th>Symbol Rate</th><th>System</th></tr>
<tr><td>Atlas News</td><td>11223</td><td>V</td><td>27500</td><td>DVB-S2 8PSK</td></tr></table>`;
const explicitRows = extractCandidatesFromHtml(explicitTuning, source('a.test').source);
assert(explicitRows.some(x => x.frequency === '11223' && x.pol === 'V' && x.sr === '27500' && x.mod === '8PSK' && x.channels.includes('Atlas News')));
console.log('Labeled tuning columns parsed without guessing missing access.');

const kingPage = `<table class="frequencies-table frq kos-frequency-header"><tr>
<td>7.0degW</td><td>Nilesat 201 13</td><td>11823.20 V</td><td>6</td>
<td>Middle-East</td><td>DVB-S</td><td>QPSK</td><td>27500</td><td>5/6</td></tr></table>
<table class="frq kos-stream-summary"><tr><td>Transport Stream</td><td>2048</td></tr></table>
<table class="fl kos-channel-table"><tr><td class="vrd"></td><td class="ch">Atlas News</td><td>Jordan</td><td>News</td>
<td>NILESAT</td><td>Clear</td><td>1107</td><td>1009</td></tr></table>`;
const kingSource = { ...source('en.kingofsat.net').source, satelliteName: 'Nilesat 201/301 + Eutelsat 7 West A' };
const king = extractKingOfSatListings(kingPage, kingSource);
assert.equal(king.candidates[0].satelliteName, 'Nilesat 201');
assert.equal(king.candidates[0].orbitalSlot, '7W');
assert.deepEqual([king.candidates[0].frequency, king.candidates[0].sr, king.accessObservations[0].status], ['11823', '27500', 'free']);
const aggregateRow = { ...row, satelliteName: kingSource.satelliteName, frequency: '11823', pol: 'V' };
const [aligned] = alignPublisherListings([aggregateRow], [king]);
assert.equal(aligned.candidates[0].satelliteName, kingSource.satelliteName);
assert.equal(aligned.candidates[0].observedSatelliteName, 'Nilesat 201');
const [conflictListing] = alignPublisherListings([aggregateRow, { ...aggregateRow, satelliteName: 'Nilesat 301' }], [king]);
assert.equal(conflictListing.candidates[0].satelliteName, 'Nilesat 201');
console.log('KingOfSat uses its exact transponder header and keeps ambiguous satellites distinct.');
