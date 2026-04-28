const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// 환경변수를 통한 비밀번호 설정 (깃허브에 노출되지 않음)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "1234";

const getInitialState = () => ({
    status: 'waiting',
    itemIndex: 0,
    currentItem: "",
    highestBid: 0,
    highestBidder: null,
    timeLeft: 30,
    players: {} 
});

// 16개의 매물 배열 (순환 큐)
// 🔥여기에 원하는 매물 이름을 16개 적어주세요. (나중에 여기서만 수정하면 됩니다)
const INITIAL_ITEMS = [
    "수아", "비앙카", "혜진", "일레븐", 
    "바냐", "띠아", "샬럿", "마르티나", 
    "리오", "니아", "로지", "슈린", 
    "시셀라", "엠마", "유스티나", "실비아"
];

// 16개의 매물 배열 (원본을 복사해서 순환 큐로 사용)
let auctionItems = [...INITIAL_ITEMS];
let auctionState = getInitialState();
let timerInterval = null;

io.on('connection', (socket) => {
    
    // [1. 입장 로직]
    socket.on('join', (data, callback) => {
        const { role, username, password } = data;
        if (role === 'admin' && password === ADMIN_PASSWORD) {
            socket.role = 'admin';
            callback({ success: true, isRole: 'admin' });
            socket.emit('updateState', auctionState);
        } else if (role === 'player' && username) {
            if (!auctionState.players[username]) {
                if (Object.keys(auctionState.players).length >= 8) return callback({ success: false, message: '8인 정원 초과' });
                // itemsWon: 0 뒤에 wonItems: [] 추가
		auctionState.players[username] = { points: 1000, connected: true, itemsWon: 0, wonItems: [] };
            } else {
                auctionState.players[username].connected = true;
            }
            socket.username = username;
            socket.role = 'player';
            callback({ success: true, isRole: 'player', username: username });
            io.emit('updateState', auctionState);
        }
    });

    // [2. 경매 시작]
    socket.on('startAuction', () => {
        if (socket.role !== 'admin' || auctionState.status === 'bidding') return;
        // 🔥 [추가된 방어 코드] 남은 매물이 없으면 시작 차단
        if (auctionItems.length === 0) {
            io.emit('systemMsg', '🛑 남은 매물이 없습니다! 모든 경매가 종료되었습니다.');
            return;
		}
        auctionState.status = 'bidding';
        auctionState.currentItem = auctionItems[0]; // 항상 큐의 맨 앞
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

    // [3. 스킵 및 경매 종료 (순환 큐 적용)]
    socket.on('skipAuction', () => {
        if (socket.role !== 'admin' || auctionState.status !== 'bidding') return;
        io.emit('systemMsg', '⏰ 방장이 시간을 즉시 마감했습니다.');
        clearInterval(timerInterval);
        auctionState.timeLeft = 0;
        io.emit('timerUpdate', 0);
        endAuction(); 
    });

        function endAuction() {
        clearInterval(timerInterval);
        auctionState.status = 'sold';
        const winner = auctionState.highestBidder;
        
        // 1. 현재 진행한 매물을 큐(배열)에서 일단 뽑아냅니다.
        const finishedItem = auctionItems.shift(); 
        
        if (winner) {
            auctionState.players[winner].points -= auctionState.highestBid;
            auctionState.players[winner].itemsWon += 1;
            auctionState.players[winner].wonItems.push(finishedItem); // 매물 이름 저장
            io.emit('systemMsg', `🎉 [${finishedItem}] ${winner}님에게 ${auctionState.highestBid}원에 낙찰!`);
            
            // 💡 [핵심 수정 포인트] 낙찰되었으므로 다시 push 하지 않습니다. (큐에서 영구 삭제)
            
        } else {
            io.emit('systemMsg', `⚠️ [${finishedItem}] 입찰자 없음. 매물이 순서의 맨 뒤로 이동합니다.`);
            
            // 💡 [핵심 수정 포인트] 유찰되었으므로 큐의 맨 뒤로 다시 집어넣습니다.
            auctionItems.push(finishedItem);
        }
        
        io.emit('updateState', auctionState);
    }


    // [4. 입찰 로직]
    socket.on('placeBid', (bidAmount) => {
       	if (auctionState.status !== 'bidding' || socket.username === auctionState.highestBidder) return;
   	 const player = auctionState.players[socket.username];
	if (player.itemsWon >= 2) return;
       // [4. 입찰 로직] 안쪽
    	// 🔥 아무도 입찰하지 않은 0원 상태라면, 0원 입찰을 예외적으로 허용!
    	const isFirstZeroBid = (bidAmount === 0 && auctionState.highestBid === 0 && auctionState.highestBidder === null);

  	  if ((bidAmount > auctionState.highestBid || isFirstZeroBid) && bidAmount <= player.points) {
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

    // [5. 방장 관리 권한 (선택, 초기화, 강퇴)]
    socket.on('selectItem', (itemName) => {
        if (socket.role !== 'admin' || auctionState.status === 'bidding') return;
        const idx = auctionItems.indexOf(itemName);
        if (idx > -1) {
            const [selected] = auctionItems.splice(idx, 1);
            auctionItems.unshift(selected); // 선택한 매물을 맨 앞으로
            auctionState.currentItem = selected;
            io.emit('updateState', auctionState);
            io.emit('systemMsg', `📢 방장이 다음 매물을 [${selected}]로 선택했습니다.`);
        }
    });

    socket.on('resetAll', () => {
        if (socket.role !== 'admin') return;
        auctionItems = [...INITIAL_ITEMS];
       	for (let user in auctionState.players) {
   		 auctionState.players[user].points = 1000;
    		auctionState.players[user].itemsWon = 0;
    		auctionState.players[user].wonItems = []; // [추가] 획득 목록 초기화
	}
        const playersRef = auctionState.players;
        auctionState = getInitialState();
        auctionState.players = playersRef;
        if (timerInterval) clearInterval(timerInterval);
        
        io.emit('updateState', auctionState);
        io.emit('systemMsg', '⚠️ 시스템이 방장에 의해 전체 초기화되었습니다.');
    });

    socket.on('kickUser', (targetUser) => {
        if (socket.role !== 'admin') return;
        if (auctionState.players[targetUser]) {
            delete auctionState.players[targetUser];
            io.emit('kicked', targetUser);
            io.emit('updateState', auctionState);
            io.emit('systemMsg', `🚫 방장이 [${targetUser}]님을 강제 퇴장시켰습니다.`);
        }
    });

    // [6. 연결 해제 처리]
    socket.on('disconnect', () => {
        if (socket.username && auctionState.players[socket.username]) {
            auctionState.players[socket.username].connected = false;
            io.emit('updateState', auctionState);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
