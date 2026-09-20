// Process metrics cover this Go service, not other tenants on the host.
export function sampleServerStats(rooms, connections, cpuPercent, memoryBytes, sampledAt = Date.now()) {
  let occupied = 0;
  for (const room of rooms.values()) {
    if (room.players.black || room.players.white || room.players.spectators.length) occupied++;
  }
  return { sampledAt, cpuPercent, memoryMiB: memoryBytes / 1048576,
    rooms: rooms.size, occupiedRooms: occupied, emptyRooms: rooms.size - occupied, connections };
}
