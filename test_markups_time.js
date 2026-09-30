import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from './server/roomManager.js';

test('Go teaching markup tools synchronize points, labels, lines, colors and clearing', () => {
  const manager = new RoomManager();
  const room = manager.createRoom({ mode: 'teach', timeControl: '60m' });
  const client = {};
  manager.joinRoom(room.roomId, client, '练习者');
  assert.equal(room.timeControl.type, 'none');
  for (const payload of [
    { type: 'triangle', r: 3, c: 3, color: '#dc2626' },
    { type: 'number', r: 4, c: 4, color: '#2563eb' },
    { type: 'letter', r: 5, c: 5, color: '#16a34a' },
    { type: 'arrow', r: 3, c: 3, toR: 5, toC: 5, color: '#dc2626' }
  ]) assert.equal(manager.handleTeachAction(client, 'markup', payload).success, true);
  assert.equal(room.teachState.annotations['4,4'].text, '1');
  assert.equal(room.teachState.annotations['5,5'].text, 'A');
  assert.equal(room.teachState.annotations['3,3'].color, '#dc2626');
  assert.equal(manager.handleTeachAction(client, 'markup', { type: 'eraser', r: 3, c: 3 }).success, true);
  assert.equal(Object.keys(room.teachState.annotations).length, 2);
  assert.equal(manager.handleTeachAction(client, 'clear_annotations').success, true);
  assert.deepEqual(room.teachState.annotations, {});
});

test('match time presets and custom time are applied, teaching stays unlimited', () => {
  const manager = new RoomManager();
  assert.deepEqual(manager.createRoom({ timeControl: '3m2s' }).timeControl, { type: '3m2s', mainTime: 180, increment: 2 });
  assert.deepEqual(manager.createRoom({ gameType: 'chess', timeControl: 'custom', customMainTime: 90, customIncrement: 7 }).timeControl, { type: 'custom', mainTime: 90, increment: 7 });
  const room = manager.createRoom({ mode: 'match', timeControl: 'none' });
  const client = {};
  manager.joinRoom(room.roomId, client);
  assert.equal(manager.configureRoom(client, { gameType: 'go', mode: 'teach', timeControl: '30s' }).changed, true);
  assert.deepEqual(room.timeControl, { type: 'none', mainTime: 0, increment: 0 });
});
