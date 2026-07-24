let currentUser = null;

// Sign Up / Create Account
function signUp() {
    const username = document.getElementById('username').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    if (!username || !email || !password) {
        alert('Please fill all fields');
        return;
    }

    // Create Firebase user
    auth.createUserWithEmailAndPassword(email, password)
        .then(userCredential => {
            const user = userCredential.user;
            currentUser = user.uid;

            // Save user info to database
            db.ref('users/' + user.uid).set({
                username: username,
                email: email,
                level: 1,
                score: 0,
                createdAt: new Date().toISOString(),
                lastActive: new Date().toISOString()
            });

            showGameUI();
            listenToOnlinePlayers();
            alert('Account created! Welcome to Lullaby!');
        })
        .catch(error => alert('Error: ' + error.message));
}

// Update Game Progress
function updateGameData() {
    if (!currentUser) return;

    const level = document.getElementById('game-level').value;
    const score = document.getElementById('game-score').value;

    db.ref('users/' + currentUser).update({
        level: parseInt(level),
        score: parseInt(score),
        lastActive: new Date().toISOString()
    }).then(() => {
        alert('Progress saved!');
    }).catch(error => alert('Error: ' + error.message));
}

// Show Online Players in Real-Time
function listenToOnlinePlayers() {
    db.ref('users').on('value', snapshot => {
        const playersList = document.getElementById('players-online');
        playersList.innerHTML = '';

        snapshot.forEach(child => {
            const player = child.val();
            const playerDiv = document.createElement('div');
            playerDiv.className = 'player-item';
            playerDiv.innerHTML = `
                <strong>${player.username}</strong> - 
                Level: ${player.level} | 
                Score: ${player.score}
            `;
            playersList.appendChild(playerDiv);
        });
    });
}

// Logout
function logout() {
    auth.signOut().then(() => {
        currentUser = null;
        document.getElementById('auth-form').style.display = 'block';
        document.getElementById('game-container').style.display = 'none';
        alert('Logged out!');
    });
}

// Show Game UI
function showGameUI() {
    document.getElementById('auth-form').style.display = 'none';
    document.getElementById('game-container').style.display = 'block';
    document.getElementById('current-player').textContent = 
        document.getElementById('username').value;
}

// Auto-login on page load
window.addEventListener('load', () => {
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user.uid;
            showGameUI();
            listenToOnlinePlayers();
        }
    });
});