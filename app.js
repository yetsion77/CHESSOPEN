import { initializeApp } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-app.js";
import { getDatabase, ref, set, onValue, remove, get, update } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-database.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";

// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyAp4o22wMDfo4hvkFNgtqwd5lsoWmTM0Yc",
    authDomain: "chess-93fef.firebaseapp.com",
    databaseURL: "https://chess-93fef-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "chess-93fef",
    storageBucket: "chess-93fef.firebasestorage.app",
    messagingSenderId: "142230472814",
    appId: "1:142230472814:web:e845fb42b0719ae6883e7f",
    measurementId: "G-BTXWL50FR5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- App State ---
// Ensure Chess is loaded globally
if (typeof window.Chess === 'undefined') {
    alert('שגיאה: ספריית השחמט לא נטענה. וודא שקובץ chess.js קיים.');
    document.getElementById('board').innerText = 'שגיאה בטעינת הקבצים. אנא רענן את העמוד.';
}

let game = new window.Chess();
let boardEl = document.getElementById('board');
let statusEl = document.getElementById('game-status');
let turnEl = document.getElementById('turn-indicator');
let selectedSquare = null;

// Playback State
let playbackInterval = null;
let currentSequenceMoves = [];
let playbackIndex = 0;

// Practice State
let currentMode = 'record';
let practiceTargetSequence = [];
let practiceMoveIndex = 0;

// Local cache of sequences for playback/practice
let localSequences = {};

// Piece Theme
const pieces = {
    'wP': 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg',
    'wR': 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
    'wN': 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg',
    'wB': 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
    'wQ': 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg',
    'wK': 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg',
    'bP': 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg',
    'bR': 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
    'bN': 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg',
    'bB': 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
    'bQ': 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg',
    'bK': 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg',
};

function init() {
    renderBoard();
    updateStatus();
    setupFirebaseListeners(); // Replaces loadSavedSequencesList
    setupEventListeners();
}

// --- Board & Interaction ---
function renderBoard() {
    boardEl.innerHTML = '';
    const boardState = game.board();

    const isBlackPerspective = (playerSide === 'black');

    // If black perspective: iterate r from 7 to 0, c from 7 to 0
    // If white perspective: iterate r from 0 to 7, c from 0 to 7

    const startR = isBlackPerspective ? 7 : 0;
    const endR = isBlackPerspective ? -1 : 8;
    const stepR = isBlackPerspective ? -1 : 1;

    const startC = isBlackPerspective ? 7 : 0;
    const endC = isBlackPerspective ? -1 : 8;
    const stepC = isBlackPerspective ? -1 : 1;

    for (let r = startR; r !== endR; r += stepR) {
        for (let c = startC; c !== endC; c += stepC) {
            const squareEl = document.createElement('div');
            // isWhite square calculation depends on coords. 
            // (0,0) is a8 (white). (0,1) is b8 (black).
            // (r+c)%2===0 is generally white.
            const isWhite = (r + c) % 2 === 0;
            const squareName = String.fromCharCode(97 + c) + (8 - r);

            squareEl.classList.add('square');
            squareEl.classList.add(isWhite ? 'white-square' : 'black-square');
            squareEl.dataset.square = squareName;

            const piece = boardState[r][c];
            if (piece) {
                const pieceImg = document.createElement('div');
                pieceImg.classList.add('piece');
                const pKey = piece.color + piece.type.toUpperCase();
                pieceImg.style.backgroundImage = `url(${pieces[pKey]})`;
                // Flip piece image if board is flipped? Usually pieces stay upright.
                // CSS background-image doesn't rotate by itself. 
                // However, if we rotated the BOARD div, we would need to unrotate pieces.
                // Here we are re-rendering the grid in different order, so pieces are upright.
                squareEl.appendChild(pieceImg);
            }

            if (selectedSquare === squareName) squareEl.classList.add('highlight');

            squareEl.addEventListener('click', () => handleSquareClick(squareName));
            boardEl.appendChild(squareEl);
        }
    }
}

function handleSquareClick(square) {
    // Online Check
    if (currentMode === 'online') {
        // Prevent if waiting
        if (document.getElementById('online-status-msg').innerText.includes('ממתין')) return;

        // Prevent if not my turn
        const isMySideWhite = playerSide === 'white';
        const isWhiteTurn = game.turn() === 'w';

        if (isMySideWhite !== isWhiteTurn) {
            // Not my turn
            return;
        }
    }

    if (currentMode === 'practice' && game.turn() !== practiceTargetSequence[practiceMoveIndex]?.color) {
        // ... practice check ...
    }

    if (!selectedSquare) {
        const piece = game.get(square);
        if (piece && piece.color === game.turn()) {
            selectedSquare = square;
            renderBoard();
            highlightLegalMoves(square);
        }
    } else {
        const move = { from: selectedSquare, to: square, promotion: 'q' };
        const legalMove = game.move(move);

        if (legalMove) {
            selectedSquare = null;
            onMoveMade(legalMove);
        } else {
            const piece = game.get(square);
            if (piece && piece.color === game.turn()) {
                selectedSquare = square;
                renderBoard();
                highlightLegalMoves(square);
            } else {
                selectedSquare = null;
                renderBoard();
            }
        }
    }
}

function highlightLegalMoves(square) {
    const moves = game.moves({ square: square, verbose: true });
    moves.forEach(move => {
        const sqEl = document.querySelector(`[data-square="${move.to}"]`);
        if (sqEl) {
            const hint = document.createElement('div');
            hint.classList.add('move-hint');
            hint.style.width = '100%';
            hint.style.height = '100%';
            hint.style.position = 'absolute';
            hint.style.pointerEvents = 'none';
            sqEl.appendChild(hint);
        }
    });
}

// Sound Effect
const moveSound = new Audio('move.ogg');

function onMoveMade(move) {
    // Play sound
    moveSound.currentTime = 0;
    moveSound.play().catch(e => console.log('Audio play failed (user interaction needed first):', e));

    renderBoard();
    updateStatus();

    if (currentMode === 'practice') {
        checkPracticeMove(move);
    }

    if (currentMode === 'online') {
        handleOnlineMove(move);
    }
}

function updateStatus() {
    let status = '';
    let moveColor = game.turn() === 'b' ? 'שחור' : 'לבן';

    if (game.in_checkmate()) {
        status = 'מט! ' + (game.turn() === 'w' ? 'השחור' : 'הלבן') + ' ניצח.';
    } else if (game.in_draw()) {
        status = 'תיקו!';
    } else {
        if (game.in_check()) status = 'שח! ';
    }

    statusEl.innerText = status;
    turnEl.innerText = moveColor;
    statusEl.innerText = status;
    turnEl.innerText = moveColor;
    renderMoveHistory();
}

function renderMoveHistory() {
    const history = game.history();
    const historyEl = document.getElementById('move-history');

    let html = '<table class="history-table"><tr><th>#</th><th>לבן</th><th>שחור</th></tr>';

    for (let i = 0; i < history.length; i += 2) {
        const num = (i / 2) + 1;
        const whiteMove = history[i];
        const blackMove = history[i + 1] || '';

        html += `<tr>
            <td class="move-num">${num}.</td>
            <td>${whiteMove}</td>
            <td>${blackMove}</td>
        </tr>`;
    }

    html += '</table>';
    historyEl.innerHTML = html;

    // Auto scroll to bottom
    const parent = historyEl.parentElement; // history-section usually has overflow?? No, history-section limits height.
    // Use .history-section from CSS
    historyEl.scrollTop = historyEl.scrollHeight;
}


// --- Firebase Sequence Management ---

function setupFirebaseListeners() {
    const sequencesRef = ref(db, 'sequences');
    onValue(sequencesRef, (snapshot) => {
        const data = snapshot.val();
        localSequences = data || {};
        updateSequencesListUI(localSequences);
    });
}

function updateSequencesListUI(sequences) {
    const list = document.getElementById('sequences-list');
    const select = document.getElementById('practice-select');
    list.innerHTML = '';
    select.innerHTML = '<option value="">בחר רצף לתרגול...</option>';

    for (const name in sequences) {
        const li = document.createElement('li');
        li.innerHTML = `<span>${name}</span> <span class="delete-seq" data-bs-name="${name}">X</span>`;

        // Load for viewing/playback
        li.querySelector('span:first-child').onclick = () => preparePlayback(name, sequences[name]);

        // Delete button
        li.querySelector('.delete-seq').onclick = (e) => {
            e.stopPropagation(); // prevent triggering parent click
            deleteSequence(name);
        };

        list.appendChild(li);

        const opt = document.createElement('option');
        opt.value = name;
        opt.innerText = name;
        select.appendChild(opt);
    }
}

function saveSequence() {
    const name = document.getElementById('sequence-name').value.trim();
    if (!name) return alert('אנא הכנס שם לרצף');
    if (game.history().length === 0) return alert('הלוח ריק');

    // Use Firebase set
    // Note: Firebase keys cannot contain certain characters like . $ # [ ] /
    // For simplicity, we assume simple names or we could sanitize.
    // Let's replace illegal chars with '_'
    const safeName = name.replace(/[.#$/\[\]]/g, '_');

    set(ref(db, 'sequences/' + safeName), game.pgn())
        .then(() => {
            alert('הרצף נשמר בהצלחה (משותף לכולם)!');
            document.getElementById('sequence-name').value = '';
        })
        .catch((error) => {
            console.error(error);
            alert('שגיאה בשמירת הרצף: ' + error.message);
        });
}

function deleteSequence(name) {
    if (!confirm('למחוק את "' + name + '" מהענן? (יימחק לכולם)')) return;

    remove(ref(db, 'sequences/' + name))
        .then(() => {
            // UI updates automatically via listener
        })
        .catch((error) => {
            alert('שגיאה במחיקה: ' + error.message);
        });
}


// --- Auto-Play / Playback Logic ---
function preparePlayback(name, pgn) {
    game.reset();

    const tempGame = new window.Chess();
    tempGame.load_pgn(pgn);
    currentSequenceMoves = tempGame.history({ verbose: true });

    playbackIndex = 0;

    renderBoard();
    updateStatus();

    document.querySelector('[data-tab="record-mode"]').click();
    currentMode = 'record';

    document.querySelector('.playback-controls').style.display = 'block';
    document.getElementById('sequence-name').value = name;

    stopPlayback();
}

function stepForward() {
    if (playbackIndex >= currentSequenceMoves.length) return;

    const move = currentSequenceMoves[playbackIndex];
    game.move(move);
    renderBoard();
    updateStatus();
    playbackIndex++;
}

function startPlayback() {
    stopPlayback();
    if (playbackIndex >= currentSequenceMoves.length) {
        game.reset();
        playbackIndex = 0;
        renderBoard();
    }

    playbackInterval = setInterval(() => {
        if (playbackIndex >= currentSequenceMoves.length) {
            stopPlayback();
        } else {
            stepForward();
        }
    }, 1000);
}

function stopPlayback() {
    if (playbackInterval) {
        clearInterval(playbackInterval);
        playbackInterval = null;
    }
}


// --- Practice Logic ---
function startPractice() {
    const select = document.getElementById('practice-select');
    const name = select.value;
    if (!name) return alert('אנא בחר רצף לתרגול');

    const pgn = localSequences[name];

    const tempGame = new window.Chess();
    tempGame.load_pgn(pgn);
    const history = tempGame.history({ verbose: true });

    if (history.length === 0) return alert('הרצף ריק');

    practiceTargetSequence = history;
    practiceMoveIndex = 0;

    game.reset();
    renderBoard();
    updateStatus();
    currentMode = 'practice';

    updatePracticeFeedback("עשה את המהלך הראשון: " + history[0].color + " " + history[0].san, 'neutral');
    document.getElementById('show-hint-btn').style.display = 'none';
}

function checkPracticeMove(moveMade) {
    const targetMove = practiceTargetSequence[practiceMoveIndex];

    // Check minimal condition
    if (moveMade.from === targetMove.from && moveMade.to === targetMove.to) {
        practiceMoveIndex++;
        updatePracticeFeedback("נכון! המשך...", 'success');
        document.getElementById('show-hint-btn').style.display = 'none';

        if (practiceMoveIndex >= practiceTargetSequence.length) {
            updatePracticeFeedback("סיימת את הרצף בהצלחה!", 'success');
            setTimeout(() => alert("כל הכבוד!"), 500);
            return;
        }

    } else {
        game.undo();
        renderBoard();
        updateStatus();
        updatePracticeFeedback("טעות! נסה שנית.", 'error');
        document.getElementById('show-hint-btn').style.display = 'block';
    }
}

function showHint() {
    if (currentMode !== 'practice' || practiceMoveIndex >= practiceTargetSequence.length) return;

    const targetMove = practiceTargetSequence[practiceMoveIndex];

    const fromEl = document.querySelector(`[data-square="${targetMove.from}"]`);
    const toEl = document.querySelector(`[data-square="${targetMove.to}"]`);

    if (fromEl) fromEl.style.backgroundColor = 'rgba(0, 255, 0, 0.4)';
    if (toEl) toEl.style.backgroundColor = 'rgba(0, 255, 0, 0.4)';
}

function updatePracticeFeedback(msg, type) {
    const fb = document.getElementById('practice-feedback');
    fb.innerText = msg;
    fb.className = 'feedback-msg';
    if (type === 'success') fb.classList.add('feedback-success');
    if (type === 'error') fb.classList.add('feedback-error');
    else fb.style.background = '#333';
}


// --- Online Multiplayer State ---
let onlineGameId = null;
let playerSide = 'white'; // 'white' (creator) or 'black' (joiner)
let myPlayerName = 'אורח';


// --- League State ---
let currentLeagueId = null;
let leaguePlayerId = null; // Generated unique ID for this session/player in league
let isLeagueHost = false;

// --- League Logic ---

function createLeague() {
    const name = currentUser ? currentUser.displayName : (document.getElementById('league-player-name').value.trim());
    if (!name) return alert('אנא הכנס שם');
    myPlayerName = name;

    // Generate League Code
    const leagueId = Math.floor(1000 + Math.random() * 9000).toString(); // 4 digits
    leaguePlayerId = 'player_' + Date.now();
    isLeagueHost = true;

    const initialData = {
        status: 'lobby', // lobby, active, finished
        players: {
            [leaguePlayerId]: { name: name, points: 0, host: true }
        },
        matches: []
    };

    set(ref(db, 'leagues/' + leagueId), initialData)
        .then(() => {
            currentLeagueId = leagueId;
            setupLeagueLobbyUI();
            listenToLeague(leagueId);
        });
}

function joinLeague() {
    const name = currentUser ? currentUser.displayName : (document.getElementById('league-player-name').value.trim());
    if (!name) return alert('אנא הכנס שם');
    myPlayerName = name;

    const code = document.getElementById('league-code-input').value.trim();
    if (!code) return alert('אנא הכנס קוד ליגה');

    const leagueRef = ref(db, 'leagues/' + code);

    // Check existence
    onValue(leagueRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return alert('ליגה לא נמצאה');

        if (data.status !== 'lobby') return alert('הליגה כבר התחילה');

        // Add myself
        leaguePlayerId = 'player_' + Date.now();
        set(ref(db, `leagues/${code}/players/${leaguePlayerId}`), {
            name: name,
            points: 0
        });

        currentLeagueId = code;
        isLeagueHost = false;
        setupLeagueLobbyUI();
        listenToLeague(code);

    }, { onlyOnce: true });
}

function startLeague() {
    if (!currentLeagueId || !isLeagueHost) return;

    // Generate Schedule (Round Robin)
    // Get players keys
    get(ref(db, `leagues/${currentLeagueId}/players`)).then(snapshot => {
        const players = snapshot.val();
        const pIds = Object.keys(players);

        if (pIds.length < 3) return alert('צריך לפחות 3 שחקנים לליגה');

        let matches = [];
        // Round Robin Generator
        for (let i = 0; i < pIds.length; i++) {
            for (let j = i + 1; j < pIds.length; j++) {
                const p1 = pIds[i];
                const p2 = pIds[j];

                matches.push({
                    id: `m_${i}_${j}`,
                    p1: p1,
                    p2: p2,
                    p1Name: players[p1].name,
                    p2Name: players[p2].name,
                    status: 'pending', // pending, playing, finished
                    winner: null
                });
            }
        }

        set(ref(db, `leagues/${currentLeagueId}/matches`), matches);
        set(ref(db, `leagues/${currentLeagueId}/status`), 'active');
    });
}

function listenToLeague(leagueId) {
    const leagueRef = ref(db, 'leagues/' + leagueId);

    onValue(leagueRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        // UI Routing based on status
        if (data.status === 'lobby') {
            updateLeagueLobbyList(data.players);
        } else if (data.status === 'active') {
            setupLeagueDashboardUI();
            updateLeagueDashboard(data);
        }
    });
}

function updateLeagueLobbyList(players) {
    const list = document.getElementById('league-players-list');
    list.innerHTML = '';

    Object.values(players).forEach(p => {
        const li = document.createElement('li');
        li.innerText = p.name + (p.host ? ' (מנהל)' : '');
        list.appendChild(li);
    });

    if (isLeagueHost) {
        document.getElementById('start-league-btn').style.display = 'block';
        document.getElementById('league-wait-msg').style.display = 'none';
    }
}

function updateLeagueDashboard(data) {
    // 1. Standings
    const players = Object.entries(data.players).map(([id, p]) => ({ id, ...p }));
    // Sort by points desc
    players.sort((a, b) => b.points - a.points);

    const tbody = document.querySelector('#league-standings tbody');
    tbody.innerHTML = '';

    players.forEach((p, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${idx + 1}</td><td>${p.name}</td><td>${p.points}</td>`;
        tbody.appendChild(tr);
    });

    // 2. Matches
    const matchesDiv = document.getElementById('league-matches-list');
    matchesDiv.innerHTML = '';

    const matches = data.matches || [];

    matches.forEach(m => {
        const isMyMatch = (m.p1 === leaguePlayerId || m.p2 === leaguePlayerId);

        const card = document.createElement('div');
        card.className = `league-match-card ${m.status === 'finished' ? 'completed' : ''}`;

        let actionBtn = '';

        if (m.status === 'pending') {
            if (isMyMatch) {
                actionBtn = `<button class="btn primary play-match-btn" onclick="playLeagueMatch('${m.id}')">שחק! 🎮</button>`;
            } else {
                actionBtn = `<span style="font-size:0.8em; color:#aaa;">ממתין...</span>`;
            }
        } else if (m.status === 'playing') {
            if (isMyMatch) {
                actionBtn = `<button class="btn primary play-match-btn" onclick="playLeagueMatch('${m.id}')">חזור למשחק</button>`;
            } else {
                actionBtn = `<span style="color: yellow; font-size:0.8em;">משוחק כעת...</span>`;
            }
        } else {
            actionBtn = `<span class="match-result">${m.winner === 'draw' ? 'תיקו' : 'הסתיים'}</span>`;
        }

        card.innerHTML = `
            <div class="league-match-info">
                <span class="match-vs">${m.p1Name} vs ${m.p2Name}</span>
            </div>
            <div>${actionBtn}</div>
        `;

        matchesDiv.appendChild(card);
    });
}

function playLeagueMatch(matchId) {
    // Redirect to Online Game Mode with this specialized ID
    // We construct a specific GameID: "LEAGUE_{LeagueID}_{MatchID}"
    const gameId = `L_${currentLeagueId}_${matchId}`;

    // Logic to switch tab and join
    // We need to know which side I am
    // Get match data first? Or just try to join as P1 or P2?
    // We can lookup in local cache usually, but here:

    // Simple approach: Set GameID and call join/create logic adapted.
    // Better: create a specialized init function.

    startLeagueGame(gameId, matchId);
}

function startLeagueGame(gameId, matchId) {
    // 1. Switch to Online Tab
    document.querySelector('[data-tab="online-mode"]').click();

    // 2. Setup standard online game but with League Callback hooks
    // Check if game exists in games/ node. If not, create it.

    const gameRef = ref(db, 'games/' + gameId);

    // Determine my role in this match (White or Black)
    // We need to fetch the match details from the matches array
    get(ref(db, `leagues/${currentLeagueId}/matches`)).then(snap => {
        const matches = snap.val();
        const match = matches.find(m => m.id === matchId);

        if (!match) return;

        const amIWhite = (match.p1 === leaguePlayerId); // P1 is White by default here
        const mySide = amIWhite ? 'white' : 'black';

        // Initial Game Setup if needed
        get(gameRef).then(gSnap => {
            if (!gSnap.exists()) {
                // Create logic
                const initialGameData = {
                    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
                    pgn: '',
                    white: { name: match.p1Name, wins: 0, time: 600 },
                    black: { name: match.p2Name, wins: 0, time: 600 },
                    turn: 'w',
                    status: 'playing', // Start immediately
                    leagueMatchId: matchId, // Tag it
                    lastMoveTime: Date.now()
                };
                set(gameRef, initialGameData);
            }
        });

        // Update League Match Status to 'playing'
        if (match.status === 'pending') {
            // Find index of match to update status
            const idx = matches.findIndex(m => m.id === matchId);
            set(ref(db, `leagues/${currentLeagueId}/matches/${idx}/status`), 'playing');
        }

        // Join
        onlineGameId = gameId;
        playerSide = mySide;
        myPlayerName = amIWhite ? match.p1Name : match.p2Name;

        setupOnlineGameUI();
        listenToGame(gameId);
        listenToChat(gameId);
    });
}

function setupLeagueLobbyUI() {
    document.getElementById('league-setup').style.display = 'none';
    document.getElementById('league-lobby').style.display = 'block';
    document.getElementById('league-code-display').innerText = currentLeagueId;
}

function setupLeagueDashboardUI() {
    document.getElementById('league-lobby').style.display = 'none';
    document.getElementById('league-dashboard').style.display = 'block';
}

// --- Modify handleOnlineMove to report League Results ---
// We need to inject this into the existing handleOnlineMove or wrapper
// See below for injection



// --- Online Logic ---

// Timer State
let whiteTime = 600;
let blackTime = 600;
let lastMoveTime = Date.now();
let timerInterval = null;

function createGame() {
    const name = document.getElementById('player-name').value.trim() || 'שחקן 1';
    myPlayerName = name;

    // Generate simple 6-digit ID
    const gameId = Math.floor(100000 + Math.random() * 900000).toString();

    // 10 minutes (600 seconds)
    // Randomize starting side
    const isCreatorWhite = Math.random() < 0.5;
    playerSide = isCreatorWhite ? 'white' : 'black';

    // Auth Check
    const creatorName = currentUser ? currentUser.displayName : (name || 'אורח');

    const initialGameData = {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        pgn: '',
        white: { name: isCreatorWhite ? creatorName : 'ממתין...', wins: 0, time: 600 },
        black: { name: isCreatorWhite ? 'ממתין...' : creatorName, wins: 0, time: 600 },
        turn: 'w',
        status: 'waiting',
        lastMove: null,
        lastMoveTime: Date.now()
    };

    set(ref(db, 'games/' + gameId), initialGameData)
        .then(() => {
            onlineGameId = gameId;
            // playerSide is already set above

            setupOnlineGameUI();
            listenToGame(gameId);
            listenToChat(gameId);
        });
}

function joinGame() {
    const name = currentUser ? currentUser.displayName : (document.getElementById('player-name').value.trim() || 'שחקן 2');
    myPlayerName = name;

    const code = document.getElementById('game-code-input').value.trim();
    if (!code) return alert('אנא הכנס קוד משחק');

    const gameRef = ref(db, 'games/' + code);

    onValue(gameRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return alert('המשחק לא נמצא');

        if (data.status === 'waiting') {
            const joinerSide = data.white.name === 'ממתין...' ? 'white' : 'black';

            // If I am white (because creator was black), update white info
            // If I am black (creator was white), update black info

            // Wait, data.white.name is "Waiting..." if creator is black.
            // So if data.white.name is 'Waiting...', I take White.

            const mySide = (data.white.name === 'ממתין...') ? 'white' : 'black';

            set(ref(db, `games/${code}/${mySide}/name`), name);
            // Wins logic needs to fetch from user profile if auth?
            // For now simple 0.

            set(ref(db, `games/${code}/status`), 'playing');
            set(ref(db, `games/${code}/lastMoveTime`), Date.now());

            onlineGameId = code;
            playerSide = mySide;

        } else if (data.status === 'playing') {
            // Maybe reconnecting? 
            // Simple check if name matches?
            if (data.white.name === name) playerSide = 'white';
            else if (data.black.name === name) playerSide = 'black';
            else return alert('המשחק מלא');

            onlineGameId = code;
        } else {
            return alert('המשחק אינו זמין');
        }

        setupOnlineGameUI();
        listenToGame(code);
        listenToChat(code);

    }, { onlyOnce: true });
}

function listenToGame(gameId) {
    const gameRef = ref(db, 'games/' + gameId);

    onValue(gameRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        // Sync Game State
        if (data.fen !== game.fen()) {
            game.load(data.fen);
            renderBoard();
            updateStatus();
        }

        // Sync Times
        whiteTime = data.white?.time || 600;
        blackTime = data.black?.time || 600;
        lastMoveTime = data.lastMoveTime || Date.now();

        if (data.status === 'playing') {
            startTimerInterval(data.turn);
        } else {
            stopTimerInterval();
        }

        // Update UI info
        if (data.white) {
            document.getElementById('white-player-name').innerText = data.white.name;
            document.getElementById('white-score').innerText = data.white.wins;
        }
        if (data.black) {
            document.getElementById('black-player-name').innerText = data.black.name;
            document.getElementById('black-score').innerText = data.black.wins;
        }

        // Status Msg
        const statusMsg = document.getElementById('online-status-msg');
        if (data.status === 'waiting') {
            statusMsg.innerText = 'ממתין ליריב...';
        } else if (data.status === 'playing') {
            const isMyTurn = (game.turn() === 'w' && playerSide === 'white') ||
                (game.turn() === 'b' && playerSide === 'black');
            statusMsg.innerText = isMyTurn ? 'תורך!' : 'תור היריב';
        } else if (data.status === 'finished') {
            statusMsg.innerText = 'המשחק נגמר!';
            document.getElementById('rematch-btn').style.display = 'block';
            stopTimerInterval();
        }
    });
}

function startTimerInterval(turn) {
    stopTimerInterval();
    timerInterval = setInterval(() => {
        if (turn === 'w') {
            if (whiteTime > 0) whiteTime--;
        } else {
            if (blackTime > 0) blackTime--;
        }

        updateTimerUI();

        // Check Timeout
        if ((playerSide === 'white' && turn === 'w' && whiteTime <= 0) ||
            (playerSide === 'black' && turn === 'b' && blackTime <= 0)) {

            // Timeout Logic
            set(ref(db, `games/${onlineGameId}/status`), 'finished');

            const winner = playerSide === 'white' ? 'black' : 'white';

            // League Result
            checkLeagueResult(winner);

            const currentWins = parseInt(document.getElementById(`${winner}-score`).innerText) || 0;
            set(ref(db, `games/${onlineGameId}/${winner}/wins`), currentWins + 1);
            stopTimerInterval();
        }

    }, 1000);
    updateTimerUI();
}

function stopTimerInterval() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    updateTimerUI();
}

function updateTimerUI() {
    const fmt = (t) => {
        const m = Math.floor(t / 60);
        const s = t % 60;
        return `${m}:${s < 10 ? '0' + s : s}`;
    };

    const wEl = document.getElementById('white-timer');
    const bEl = document.getElementById('black-timer');

    if (wEl) {
        wEl.innerText = fmt(whiteTime);
        wEl.style.color = whiteTime < 30 ? '#ff5252' : '#fff';
    }
    if (bEl) {
        bEl.innerText = fmt(blackTime);
        bEl.style.color = blackTime < 30 ? '#ff5252' : '#fff';
    }
}

function handleOnlineMove(move) {
    if (!onlineGameId) return;

    const turn = game.turn(); // This is the NEXT turn
    const mover = turn === 'w' ? 'black' : 'white'; // Previous turn

    const updates = {};
    updates[`games/${onlineGameId}/fen`] = game.fen();
    updates[`games/${onlineGameId}/pgn`] = game.pgn();
    updates[`games/${onlineGameId}/turn`] = turn;
    updates[`games/${onlineGameId}/lastMove`] = move;
    updates[`games/${onlineGameId}/lastMoveTime`] = Date.now();

    // Sync time to DB atomically with the move
    if (mover === 'white') updates[`games/${onlineGameId}/white/time`] = whiteTime;
    else updates[`games/${onlineGameId}/black/time`] = blackTime;

    if (game.game_over()) {
        updates[`games/${onlineGameId}/status`] = 'finished';

        if (game.in_checkmate()) {
            const winner = game.turn() === 'b' ? 'white' : 'black';
            checkLeagueResult(winner);

            // We can't verify 'wins' score locally safely for atomic update without transaction, 
            // but for simplicity we'll just set it separate or assume it updates via listener later.
            // Or better: don't include it in this atomic update if it requires reading current value.
            // The existing listener logic handles end game UI.
            // Let's keep the win increment logic separate or use transaction if needed.
            // For now, keeping original logic for wins outside the big update or triggering it separately.
            if (playerSide === winner) {
                const currentWins = parseInt(document.getElementById(`${winner}-score`).innerText) || 0;
                set(ref(db, `games/${onlineGameId}/${winner}/wins`), currentWins + 1);
            }
        } else if (game.in_draw()) {
            checkLeagueResult('draw');
        }
    }

    update(ref(db), updates);
}

function checkLeagueResult(winnerColor) {
    if (!currentLeagueId || !onlineGameId) return;

    get(ref(db, `games/${onlineGameId}/leagueMatchId`)).then(snap => {
        const matchId = snap.val();
        if (!matchId) return;

        get(ref(db, `leagues/${currentLeagueId}/matches`)).then(mSnap => {
            const matches = mSnap.val();
            const idx = matches.findIndex(m => m.id === matchId);
            if (idx === -1) return;
            if (matches[idx].status === 'finished') return;

            let p1Points = 0;
            let p2Points = 0;
            let winnerId = null;

            if (winnerColor === 'draw') {
                p1Points = 1;
                p2Points = 1;
                winnerId = 'draw';
            } else {
                if (winnerColor === 'white') {
                    p1Points = 3;
                    winnerId = matches[idx].p1;
                } else {
                    p2Points = 3;
                    winnerId = matches[idx].p2;
                }
            }

            set(ref(db, `leagues/${currentLeagueId}/matches/${idx}/status`), 'finished');
            set(ref(db, `leagues/${currentLeagueId}/matches/${idx}/winner`), winnerId);

            get(ref(db, `leagues/${currentLeagueId}/players`)).then(pSnap => {
                const players = pSnap.val();
                if (!players) return;

                const p1 = players[matches[idx].p1];
                const p2 = players[matches[idx].p2];

                if (p1) set(ref(db, `leagues/${currentLeagueId}/players/${matches[idx].p1}/points`), (p1.points || 0) + p1Points);
                if (p2) set(ref(db, `leagues/${currentLeagueId}/players/${matches[idx].p2}/points`), (p2.points || 0) + p2Points);
            });
        });
    });
}

function setupOnlineGameUI() {
    document.getElementById('online-setup').style.display = 'none';
    document.getElementById('online-lobby').style.display = 'block';
    document.getElementById('online-game-ui').style.display = 'block';

    document.getElementById('display-game-code').innerText = onlineGameId;

    if (playerSide === 'white') {
        game.reset();
        renderBoard();
        updateStatus();
    }

    document.querySelector('#online-game-ui #white-player-name').innerText = (playerSide === 'white' ? myPlayerName : 'יריב');
}

function startRematch() {
    if (!onlineGameId) return;
    game.reset();
    set(ref(db, `games/${onlineGameId}/fen`), game.fen());
    set(ref(db, `games/${onlineGameId}/pgn`), '');
    set(ref(db, `games/${onlineGameId}/status`), 'playing');

    set(ref(db, `games/${onlineGameId}/white/time`), 600);
    set(ref(db, `games/${onlineGameId}/black/time`), 600);
    set(ref(db, `games/${onlineGameId}/lastMoveTime`), Date.now());

    document.getElementById('rematch-btn').style.display = 'none';
}


// --- Chat Logic ---

function sendChat() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text || !onlineGameId) return;

    // Push message
    const msgData = {
        sender: myPlayerName,
        text: text,
        timestamp: Date.now()
    };

    // We use push() to generate a unique ID
    // We can't import push easily without changing imports? 
    // Actually we can use set with unique timestamp ID or simple list
    // Simple custom ID:
    const msgId = Date.now() + '_' + Math.random().toString(36).substr(2, 5);

    set(ref(db, `games/${onlineGameId}/chat/${msgId}`), msgData);

    input.value = '';
}

function listenToChat(gameId) {
    const chatRef = ref(db, `games/${gameId}/chat`);
    const chatBox = document.getElementById('chat-messages');
    chatBox.innerHTML = ''; // Clear prev

    onValue(chatRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        chatBox.innerHTML = '';

        // Convert to array and sort
        const msgs = Object.values(data).sort((a, b) => a.timestamp - b.timestamp);

        msgs.forEach(msg => {
            const div = document.createElement('div');
            const isMe = msg.sender === myPlayerName;

            div.className = `chat-msg ${isMe ? 'mine' : 'opponent'}`;
            div.innerHTML = `
                <div class="chat-sender">${isMe ? 'אני' : msg.sender}</div>
                <div>${msg.text}</div>
            `;
            chatBox.appendChild(div);
        });

        // Auto scroll
        chatBox.scrollTop = chatBox.scrollHeight;
    });
}



// --- Event Listeners ---
function setupEventListeners() {
    document.getElementById('reset-btn').addEventListener('click', () => {
        try {
            game.reset();
            renderBoard();
            updateStatus();
            selectedSquare = null;
            document.getElementById('move-history').innerText = '';
            stopPlayback();
            const controls = document.querySelector('.playback-controls');
            if (controls) controls.style.display = 'none';
        } catch (e) {
            console.error(e);
            alert('אירעה שגיאה בנסיון לאפס את הלוח');
        }
    });

    document.getElementById('undo-btn').addEventListener('click', () => {
        game.undo();
        renderBoard();
        updateStatus();
        selectedSquare = null;
    });

    document.getElementById('save-btn').addEventListener('click', saveSequence);
    document.getElementById('start-practice-btn').addEventListener('click', startPractice);

    document.getElementById('play-btn').addEventListener('click', startPlayback);
    document.getElementById('pause-btn').addEventListener('click', stopPlayback);
    document.getElementById('next-move-btn').addEventListener('click', stepForward);

    document.getElementById('show-hint-btn').addEventListener('click', showHint);

    // Online Buttons
    const createBtn = document.getElementById('create-game-btn');
    if (createBtn) createBtn.addEventListener('click', createGame);

    const joinBtn = document.getElementById('join-game-btn');
    if (joinBtn) joinBtn.addEventListener('click', joinGame);

    const rematchBtn = document.getElementById('rematch-btn');
    if (rematchBtn) rematchBtn.addEventListener('click', startRematch);

    // Display Code Copy
    const codeDisplay = document.getElementById('display-game-code');
    if (codeDisplay) codeDisplay.addEventListener('click', (e) => {
        navigator.clipboard.writeText(e.target.innerText);
        alert('הקוד הועתק!');
    });

    // Promotion Modal Choices
    document.querySelectorAll('.promotion-piece').forEach(el => {
        el.addEventListener('click', (e) => {
            const piece = e.target.getAttribute('data-piece');
            handlePromotionChoice(piece);
        });
    });

    // League Buttons
    document.getElementById('create-league-btn').addEventListener('click', createLeague);
    document.getElementById('join-league-btn').addEventListener('click', joinLeague);
    document.getElementById('start-league-btn').addEventListener('click', startLeague);
    // Expose for HTML onclick
    window.playLeagueMatch = playLeagueMatch;

    // Chat Listeners
    document.getElementById('chat-send-btn').addEventListener('click', sendChat);
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChat();
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            e.target.classList.add('active');
            const tabId = e.target.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');

            if (tabId === 'record-mode') {
                currentMode = 'record';
                playerSide = 'white'; // Reset view to default
                renderBoard(); // Re-render needed if it was flipped
                updatePracticeFeedback("", 'neutral');
            } else if (tabId === 'online-mode') {
                currentMode = 'online';
                // If we are already in a game, ensure board is sync
                if (onlineGameId) {
                    // Logic to maybe restore board state if we navigated away?
                    // For now, assume single page app persistence
                }
            } else {
                stopPlayback();
                currentMode = 'practice';
                playerSide = 'white'; // Reset view
                renderBoard();
            }
        });
    });
}

// Global Exports for HTML event handlers if needed (though we attached listeners)
// But 'deleteSequence' was used inline. We attached listener in updateSequencesListUI instead.
// To be safe for any inline onclick remnants in HTML that might slip through (though I removed them in updateSequencesListUI logic above)
window.preparePlayback = preparePlayback;


// --- Authentication Logic ---
const auth = getAuth(app);
let currentUser = null;

function login() {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider)
        .then((result) => {
            // User signed in
            console.log("User logged in:", result.user);
        })
        .catch((error) => {
            console.error("Login failed:", error);
            alert("התחברות נכשלה: " + error.message);
        });
}

function logout() {
    signOut(auth).then(() => {
        // Sign-out successful.
    }).catch((error) => {
        console.error("Logout failed:", error);
    });
}

// Auth Listener
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    updateAuthUI(user);

    if (user) {
        // Save/Update user in DB
        const userRef = ref(db, 'users/' + user.uid);
        get(userRef).then(snapshot => {
            const userData = snapshot.val();
            if (!userData) {
                // First time
                set(userRef, {
                    name: user.displayName,
                    email: user.email,
                    photo: user.photoURL,
                    wins: 0,
                    joinedAt: Date.now()
                });
            } else {
                // Update last seen or minimal info?
                // For now just keep it simple.
            }
        });
    }
});

function updateAuthUI(user) {
    const loggedOutView = document.getElementById('logged-out-view');
    const loggedInView = document.getElementById('logged-in-view');

    // Inputs to hide/autofill
    const nameInputs = [
        document.getElementById('player-name'),
        document.getElementById('league-player-name')
    ];

    if (user) {
        loggedOutView.style.display = 'none';
        loggedInView.style.display = 'flex';

        document.getElementById('user-name').innerText = user.displayName;
        document.getElementById('user-avatar').src = user.photoURL;

        // Auto-fill names and hide inputs if desired
        // Or just let them override? Better to hide to enforce identity.
        nameInputs.forEach(input => {
            if (input) {
                input.value = user.displayName;
                input.style.display = 'none';
            }
        });

    } else {
        loggedOutView.style.display = 'block';
        loggedInView.style.display = 'none';

        nameInputs.forEach(input => {
            if (input) {
                input.value = '';
                input.style.display = 'block';
            }
        });
    }
}

// Make sure to bind these new buttons!
document.getElementById('login-btn').addEventListener('click', login);
document.getElementById('logout-btn').addEventListener('click', logout);


init();
