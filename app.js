import { initializeApp } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-app.js";
import { getDatabase, ref, set, onValue, remove } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-database.js";

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

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const squareEl = document.createElement('div');
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


// --- Online Logic ---

function createGame() {
    const name = document.getElementById('player-name').value.trim() || 'שחקן 1';
    myPlayerName = name;

    // Generate simple 6-digit ID
    const gameId = Math.floor(100000 + Math.random() * 900000).toString();

    const initialGameData = {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        pgn: '',
        white: { name: name, wins: 0 },
        black: { name: 'ממתין...', wins: 0 },
        turn: 'w',
        status: 'waiting', // waiting, playing, finished
        lastMove: null
    };

    set(ref(db, 'games/' + gameId), initialGameData)
        .then(() => {
            onlineGameId = gameId;
            playerSide = 'white';

            // Switch to game view
            setupOnlineGameUI();
            listenToGame(gameId);
        });
}

function joinGame() {
    const name = document.getElementById('player-name').value.trim() || 'שחקן 2';
    myPlayerName = name;

    const code = document.getElementById('game-code-input').value.trim();
    if (!code) return alert('אנא הכנס קוד משחק');

    // Check if game exists
    const gameRef = ref(db, 'games/' + code);

    // Read once
    onValue(gameRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            alert('המשחק לא נמצא');
            return;
        }

        // Update Black player
        // Note: we only want to do this ONCE.
        if (data.status === 'waiting') {
            set(ref(db, `games/${code}/black`), { name: name, wins: 0 });
            set(ref(db, `games/${code}/status`), 'playing');
        }

        onlineGameId = code;
        playerSide = 'black';

        setupOnlineGameUI();
        listenToGame(code);

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
            updateStatus(); // Updates history text
        }

        // Update UI info
        document.getElementById('white-player-name').innerText = data.white.name;
        document.getElementById('white-score').innerText = data.white.wins;

        document.getElementById('black-player-name').innerText = data.black.name;
        document.getElementById('black-score').innerText = data.black.wins;

        // Update Status Msg
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
        }
    });
}

function handleOnlineMove(move) {
    if (!onlineGameId) return;

    // Update Firebase
    const newFen = game.fen();
    const newPgn = game.pgn();

    set(ref(db, `games/${onlineGameId}/fen`), newFen);
    set(ref(db, `games/${onlineGameId}/pgn`), newPgn);
    set(ref(db, `games/${onlineGameId}/turn`), game.turn());
    set(ref(db, `games/${onlineGameId}/lastMove`), move);

    // Check Game Over
    if (game.game_over()) {
        set(ref(db, `games/${onlineGameId}/status`), 'finished');

        // Update score if checkmate
        if (game.in_checkmate()) {
            const winner = game.turn() === 'b' ? 'white' : 'black';

            if (playerSide === winner) {
                const currentWins = parseInt(document.getElementById(`${winner}-score`).innerText) || 0;
                set(ref(db, `games/${onlineGameId}/${winner}/wins`), currentWins + 1);
            }
        }
    }
}

function setupOnlineGameUI() {
    document.getElementById('online-setup').style.display = 'none';
    document.getElementById('online-lobby').style.display = 'block';
    document.getElementById('online-game-ui').style.display = 'block';

    document.getElementById('display-game-code').innerText = onlineGameId;

    // Reset Board for new game
    if (playerSide === 'white') {
        game.reset();
        renderBoard();
        updateStatus();
    }

    // Update Labels
    document.querySelector('#online-game-ui #white-player-name').innerText = (playerSide === 'white' ? myPlayerName : 'יריב');
}


function startRematch() {
    if (!onlineGameId) return;
    // Reset logic
    game.reset();
    set(ref(db, `games/${onlineGameId}/fen`), game.fen());
    set(ref(db, `games/${onlineGameId}/pgn`), '');
    set(ref(db, `games/${onlineGameId}/status`), 'playing');

    // Reset Times
    set(ref(db, `games/${onlineGameId}/white/time`), 600);
    set(ref(db, `games/${onlineGameId}/black/time`), 600);
    set(ref(db, `games/${onlineGameId}/lastMoveTime`), Date.now());

    document.getElementById('rematch-btn').style.display = 'none';
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

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            e.target.classList.add('active');
            const tabId = e.target.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');

            if (tabId === 'record-mode') {
                currentMode = 'record';
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
            }
        });
    });
}

// Global Exports for HTML event handlers if needed (though we attached listeners)
// But 'deleteSequence' was used inline. We attached listener in updateSequencesListUI instead.
// To be safe for any inline onclick remnants in HTML that might slip through (though I removed them in updateSequencesListUI logic above)
window.preparePlayback = preparePlayback;

init();
