import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMember,
  createRoom,
  addMember,
  applyCommand,
  advance,
  snapshot,
} from '../server/model.ts';

function game() {
  const room = createRoom(
    'ACC234',
    {
      ...createMember('host', 'Host', 'secret', 1000),
      accountId: 'account-one',
    },
    1000,
  );
  addMember(room, {
    ...createMember('friend', 'Friend', 'secret2', 1000),
    accountId: 'account-two',
  });
  addMember(room, createMember('guest', 'Guest', 'secret3', 1000));
  applyCommand(room, 'host', { type: 'start' }, 1000);
  return room;
}
void test('completed rounds emit account results once, omit guests and spectators, and hide account IDs', () => {
  const room = game();
  assert.ok(room.matchId);
  room.phase = 'finished';
  room.winner = 'host';
  room.players[0].kills = 3;
  room.players[1].spectator = true;
  advance(room, 2000);
  assert.deepEqual(room.accountResults, [
    {
      matchId: room.matchId,
      accountId: 'account-one',
      mode: 'solo',
      wins: 1,
      kills: 3,
      deaths: 0,
    },
  ]);
  const results = JSON.stringify(room.accountResults);
  advance(room, 2100);
  assert.equal(JSON.stringify(room.accountResults), results);
  assert.ok(!JSON.stringify(snapshot(room, 2100)).includes('account-one'));
  assert.ok(!JSON.stringify(snapshot(room, 2100)).includes(room.matchId!));
});
void test('team victories credit each signed-in teammate; unfinished rounds have no results', () => {
  const room = game();
  assert.equal('accountResults' in room, false);
  room.mode = 'duos';
  room.players[0].team = 0;
  room.players[1].team = 0;
  room.phase = 'finished';
  room.winner = 'host';
  room.winningTeam = 0;
  advance(room, 2000);
  assert.deepEqual(
    room.accountResults?.map((r) => r.wins),
    [1, 1],
  );
});
