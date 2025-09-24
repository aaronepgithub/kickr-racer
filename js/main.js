import { state } from './state.js';
import { FirebaseController } from './firebase.js';
import { BluetoothController } from './bluetooth.js';
import { PhysicsController } from './physics.js';
import { UIController } from './ui.js';

// --- MAIN GAME LOOP ---
let lastUpdateTime = Date.now();
function gameLoop() {
    const now = Date.now();
    const deltaTime = (now - lastUpdateTime) / 1000; // seconds
    lastUpdateTime = now;

    if (state.trainer.connected && state.raceId && state.gpxData) {
         // Calculate speed based on power
        const speedMps = PhysicsController.calculateSpeedMps(state.power, state.gradient, state.riderWeightLbs);
        state.speed = speedMps * 2.23694; // Convert m/s to mph
        UIController.updateSpeed();

        // Find current segment in the GPX route
        let currentSegment = state.gpxData.find(s => state.distanceCovered >= s.startDistance && state.distanceCovered < (s.startDistance + s.distance));
        if (currentSegment) {
            const newGradient = currentSegment.gradient;
            if (Math.abs(newGradient - state.gradient) > 0.1) {
                 state.gradient = newGradient;
                 BluetoothController.setGradient(state.gradient);
                 UIController.updateGradient();
            }
        }

        // Only accumulate distance if the race has started
        if (state.raceStarted && state.speed > 0) {
            const previousDistance = state.distanceCovered;
            const distanceThisFrame = Math.min(0.1, (state.speed / 3600) * deltaTime); // distance in miles
            state.distanceCovered = Math.min(state.totalDistance, state.distanceCovered + distanceThisFrame);
            UIController.updateDistance();

            // Check if the race was just finished
            if (previousDistance < state.totalDistance && state.distanceCovered >= state.totalDistance) {
                FirebaseController.updatePlayerState(true); // Force a final update
            }
        }

        // Throttled update player state for live leaderboard/dots
        FirebaseController.updatePlayerState();
    }

    requestAnimationFrame(gameLoop);
}

// --- INITIALIZATION ---
function init() {
    FirebaseController.init();
    UIController.init();
    gameLoop();
}

init();
