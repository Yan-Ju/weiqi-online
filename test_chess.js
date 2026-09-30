import test from 'node:test';
import assert from 'node:assert/strict';
import { ChessRules } from './server/chessRules.js';
import { RoomManager } from './server/roomManager.js';
const pos = s => [8-Number(s[1]),s.charCodeAt(0)-97];
const move = (g,from,to,promotion='q') => g.playMove(...pos(from),...pos(to),g.currentTurn,false,promotion);
const load = (g,fen) => { g.engine.load(fen); g.sync(); };
function fixture(mode='match',timeControl='none') { const m=new RoomManager(),room=m.createRoom({gameType:'chess',mode,timeControl}),w={},b={},s={}; m.joinRoom(room.roomId,w);m.joinRoom(room.roomId,b);m.joinRoom(room.roomId,s);return {m,room,w,b,s}; }

test('chess legality: White starts, own check, pinned pieces and king capture forbidden',()=>{
 const g=new ChessRules(); assert.equal(g.currentTurn,2); assert.equal(g.legalMoves().length,20);
 assert.equal(move(g,'e2','e5').success,false); assert.ok(move(g,'e2','e4').success);assert.equal(g.currentTurn,1);
 load(g,'k3r3/8/8/8/8/8/4R3/4K3 w - - 0 1'); assert.equal(move(g,'e2','d2').success,false);assert.ok(move(g,'e2','e8').success);
});
test('castling relocates rook, rejects castling across attack; en passant removes correct pawn',()=>{
 const g=new ChessRules();load(g,'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
 assert.ok(move(g,'e1','g1').success); assert.equal(g.board[7][5],'R');assert.equal(g.board[7][7],0);
 load(g,'k4r2/8/8/8/8/8/8/4K2R w K - 0 1'); assert.equal(move(g,'e1','g1').success,false);
 load(g,'4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1');assert.ok(move(g,'d7','d5').success);assert.ok(move(g,'e5','d6').success);assert.equal(g.board[3][3],0);assert.equal(g.board[2][3],'P');assert.equal(g.captures[2],1);
});
test('promotion accepts all four pieces; mate, stalemate and insufficient material have distinct outcomes',()=>{
 for(const p of ['q','r','b','n']) {const g=new ChessRules();load(g,'4k3/P7/8/8/8/8/8/4K3 w - - 0 1');assert.ok(move(g,'a7','a8',p).success);assert.equal(g.board[0][0],p.toUpperCase());}
 const g=new ChessRules(); for(const [a,b] of [['f2','f3'],['e7','e5'],['g2','g4'],['d8','h4']]) assert.ok(move(g,a,b).success);
 assert.equal(g.outcome().winner,'black');assert.match(g.outcome().reason,/将死/);
 load(g,'7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');assert.match(g.outcome().reason,/逼和/);
 load(g,'7k/8/6K1/8/8/8/8/8 w - - 0 1');assert.match(g.outcome().reason,/子力不足/);
});
test('repetition and fifty-move draws are recognized',()=>{
 const g=new ChessRules();for(let i=0;i<2;i++) for(const [a,b] of [['g1','f3'],['g8','f6'],['f3','g1'],['f6','g8']]) assert.ok(move(g,a,b).success);
 assert.match(g.outcome().reason,/三次重复/);
 load(g,'7k/8/6K1/8/8/8/R7/8 w - - 99 51');move(g,'a2','a3');assert.match(g.outcome().reason,/五十回合/);
});
test('room match enforces roles, clocks and terminal checkmate; Go-only endpoints reject chess',()=>{
 const {m,room,w,b,s}=fixture('match','1m10s');assert.equal(w.role,'white');
 assert.equal(m.handleMove(b,1,4,3,4).success,false);assert.equal(m.handleMove(s,6,4,4,4).success,false);
 assert.equal(m.handlePass(w).success,false);assert.equal(m.startScoring(w).success,false);assert.equal(m.changeBoardSize(w,9).success,false);
 room.clocks.lastTick=Date.now()-3000;
 assert.ok(m.handleMove(w,6,5,5,5).success);assert.ok(room.clocks.whiteTime>66&&room.clocks.whiteTime<=67);
 assert.ok(m.handleMove(b,1,4,3,4).success);assert.ok(m.handleMove(w,6,6,4,6).success);assert.ok(m.handleMove(b,0,3,4,7).success);
 assert.equal(room.status,'finished');assert.equal(room.winner,'black');assert.equal(room.clocks.active,false);assert.equal(m.handleMove(w,6,4,4,4).success,false);
});
test('free setup supports all twelve pieces, moving, erasing, undo/redo and branches',()=>{
 const {m,room,w,s}=fixture('teach');const act=(action,payload)=>m.handleTeachAction(w,action,payload);
 assert.equal(m.handleTeachAction(s,'clear_board').success,false);assert.ok(act('clear_board').success);
 for(const [i,piece] of [...'PNBRQKpnbrqk'].entries()) assert.ok(act('set_chess_piece',{r:Math.floor(i/8),c:i%8,piece}).success);
 assert.ok(m.handleMove(w,0,0,4,4).success);assert.equal(room.game.board[4][4],'P');assert.ok(act('undo').success);assert.equal(room.game.board[0][0],'P');assert.ok(act('redo').success);assert.equal(room.game.board[4][4],'P');
 assert.ok(act('set_chess_piece',{r:4,c:4,piece:0}).success);assert.ok(act('undo').success);assert.equal(room.game.board[4][4],'P');
 assert.ok(act('set_turn',{color:1}).success);assert.equal(room.game.currentTurn,1);assert.equal(room.game.redoStack.length,0);
 assert.equal(act('set_chess_piece',{r:.5,c:1,piece:'K'}).success,false);
});
test('same-room game/mode switch requires match consent; proposals expire on moves and cannot be self-approved',()=>{
 const {m,room,w,b,s}=fixture();const config={gameType:'go',mode:'teach',boardSize:13,komi:6.5,timeControl:'none'};
 assert.equal(m.configureRoom(s,config).success,false);assert.ok(m.configureRoom(w,config).pending);
 let id=room.pendingConfig.id;assert.equal(m.respondConfig(w,id,true).success,false);assert.ok(m.handleMove(w,6,4,4,4).success);assert.equal(room.pendingConfig,null);assert.equal(m.respondConfig(b,id,true).success,false);
 m.configureRoom(w,config);id=room.pendingConfig.id;assert.ok(m.respondConfig(b,id,true).changed);assert.equal(room.gameType,'go');assert.equal(room.boardSize,13);assert.equal(room.mode,'teach');assert.equal(m.rooms.size,1);assert.equal(room.players.white,w);
 assert.ok(m.configureRoom(w,{...config,gameType:'chess',mode:'teach'}).changed);assert.equal(room.game.board[7][4],'K');assert.equal(room.game.currentTurn,2);
});
test('draw agreement finishes match; departed opponent cannot permit a unilateral reset',()=>{
 const {m,room,w,b}=fixture();m.handleMove(w,6,4,4,4);m.leaveRoom(b);assert.equal(m.newGame(w).success,false);m.joinRoom(room.roomId,b);
 assert.ok(m.offerDraw(w).offered);assert.ok(m.offerDraw(b).finished);assert.equal(room.winner,'draw');
});
