const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "314159";

// 16개의 매물 배열 (순환 큐)
let auctionItems = Array.from({length: 16}, (_, i) => `${i + 1}번 매물`);
let roundCount = 0; 

let auctionState = {
    status: 'waiting',
    itemIndex: 0,
    currentItem: "",
    highestBid: 0,
    highestBidder: null,
    timeLeft: 30,
    players: {} 
};

let timerInterval = null;

io.on('connection', (socket) => {
    
    socket.on('join', (data, callback) => {
        const { role, username, password } = data;
        if (role === 'admin' && password === ADMIN_PASSWORD) {
            socket.role = 'admin';
            callback({ success: true, isRole: 'admin' });
            socket.emit('updateState', auctionState);
        } else if (role === 'player' && username) {
            if (!auctionState.players[username]) {
                if (Object.keys(auctionState.players).length >= 8) return callback({ success: false, message: '8인 정원 초과' });
                auctionState.players[username] = { points: 1000, connected: true };
            } else {
                auctionState.players[username].connected = true;
            }
            socket.username = username;
            socket.role = 'player';
            callback({ success: true, isRole: 'player', username: username });
            io.emit('updateState', auctionState);
        }
    });

    socket.on('startAuction', () => {
        if (socket.role !== 'admin' || auctionState.status === 'bidding') return;
        
        auctionState.status = 'bidding';
        auctionState.currentItem = auctionItems[0]; // 항상 배열의 첫 번째 매물
        auctionState.highestBid = 0;
        auctionState.highestBidder = null;
        auctionState.timeLeft = 30; 
        
        io.emit('updateState', auctionState);
        io.emit('systemMsg', `--- [${auctionState.currentItem}] 경매 시작! ---`);

        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            auctionState.timeLeft--;
            io.emit('timerUpdate', auctionState.timeLeft);
            if (auctionState.timeLeft <= 0) {
                endAuction();
            }
        }, 1000);
    });

    // [1. 스킵 버튼: 시간을 0초로 만들고 낙찰/유찰 확정]
    socket.on('skipAuction', () => {
        if (socket.role !== 'admin' || auctionState.status !== 'bidding') return;
        io.emit('systemMsg', '⏰ 방장이 시간을 마감했습니다.');
        clearInterval(timerInterval);
        auctionState.timeLeft = 0;
        io.emit('timerUpdate', 0);
        endAuction(); 
    });

    // [2. 경매 종료 로직: 무조건 매물을 16번 뒤로 보냄]
    function endAuction() {
        clearInterval(timerInterval);
        auctionState.status = 'sold';
        const winner = auctionState.highestBidder;
        
        if (winner) {
            // 입찰자가 있을 때: 포인트 차감 후 메시지 출력
            auctionState.players[winner].points -= auctionState.highestBid;
            io.emit('systemMsg', `🎉 [${auctionState.currentItem}] ${winner}님에게 ${auctionState.highestBid}원에 낙찰!`);
        } else {
            // 입찰자가 없을 때 (유찰)
            io.emit('systemMsg', `⚠️ [${auctionState.currentItem}] 입찰자 없음. 매물이 순서의 맨 뒤로 이동합니다.`);
        }

        // 핵심: 결과와 상관없이 배열의 첫 번째 요소를 빼서 맨 뒤로 푸시 (O(n) shift/push)
        const itemToMove = auctionItems.shift();
        auctionItems.push(itemToMove);
        roundCount++;
        
        // 프론트엔드에 갱신된 상태(다음 매물 대기 상태) 전송
        io.emit('updateState', auctionState);
    }

    socket.on('placeBid', (bidAmount) => {
        if (auctionState.status !== 'bidding' || socket.username === auctionState.highestBidder) return;
        const player = auctionState.players[socket.username];
        if (bidAmount > auctionState.highestBid && bidAmount <= player.points) {
            auctionState.highestBid = bidAmount;
            auctionState.highestBidder = socket.username;
            if (auctionState.timeLeft <= 5) {
                auctionState.timeLeft = 5;
                io.emit('timerUpdate', auctionState.timeLeft);
            }
            io.emit('updateState', auctionState);
            io.emit('systemMsg', `${socket.username}: ${bidAmount}원!`);
        }
    });

    socket.on('disconnect', () => {
        if (socket.username && auctionState.players[socket.username]) {
            auctionState.players[socket.username].connected = false;
            io.emit('updateState', auctionState);
        }
    });
});

server.listen(3000, () => console.log('http://localhost:3000'));