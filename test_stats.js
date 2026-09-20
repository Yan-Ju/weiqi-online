import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from './server/roomManager.js';
import { sampleServerStats } from './server/serverStats.js';
test('telemetry distinguishes occupied, spectator-only and empty rooms through cleanup', () => {
  const m = new RoomManager();
  const a = m.createRoom(), b = m.createRoom(), c = m.createRoom();
  m.joinRoom(a.roomId, {});
  b.players.spectators.push({}); b.emptySince = null;
  const sample = () => sampleServerStats(m.rooms, 4, 12.5, 64 * 1048576, 123);
  assert.deepEqual(sample(), { sampledAt: 123, cpuPercent: 12.5, memoryMiB: 64, rooms: 3, occupiedRooms: 2, emptyRooms: 1, connections: 4 });
  m.cleanupRooms(Date.now() + 61000);
  assert.equal(sample().rooms, 2);
  assert.equal(sample().emptyRooms, 0);
});
