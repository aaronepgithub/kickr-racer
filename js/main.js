import { state } from './state.js';
import { DOMElements } from './dom.js';
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

    if (state.trainer.connected && state.raceStarted && state.gpxData) {
        // --- Physics and State Updates ---
        const speedMps = PhysicsController.calculateSpeedMps(state.power, state.gradient, state.riderWeightLbs);
        state.speed = speedMps * 2.23694; // Convert m/s to mph
        state.elapsedTime += deltaTime;

        if (state.speed > 0) {
            const distanceThisFrame = (state.speed / 3600) * deltaTime; // distance in miles
            state.distanceCovered = Math.min(state.totalDistance, state.distanceCovered + distanceThisFrame);
        }

        // --- UI Updates ---
        UIController.updateSpeed();
        UIController.updateDistance();
        UIController.updateElapsedTime();
        UIController.updateRacerDots();

        // --- Checkpoint and Ghost Logic ---
        const nextCheckpoint = state.course.checkpoints[state.nextCheckpointIndex];
        if (nextCheckpoint && state.distanceCovered >= nextCheckpoint.distance) {
            state.checkpointTimes.push({ mile: nextCheckpoint.mile, time: state.elapsedTime });

            // Compare with ghost if a record run exists
            if (state.course.recordRun && state.course.recordRun.checkpointTimes) {
                const ghostCheckpoint = state.course.recordRun.checkpointTimes.find(ct => ct.mile === nextCheckpoint.mile);
                if (ghostCheckpoint) {
                    const timeDiff = state.elapsedTime - ghostCheckpoint.time;
                    UIController.updateGhostDiff(timeDiff);
                }
            }
            state.nextCheckpointIndex++;
        }

        // --- Gradient Updates ---
        let currentSegment = state.gpxData.find(s => state.distanceCovered >= s.startDistance && state.distanceCovered < (s.startDistance + s.distance));
        if (currentSegment) {
            const newGradient = currentSegment.gradient;
            if (Math.abs(newGradient - state.gradient) > 0.1) {
                 state.gradient = newGradient;
                 BluetoothController.setGradient(state.gradient);
                 UIController.updateGradient();
            }
        }

        // --- Finish Race Logic ---
        if (state.distanceCovered >= state.totalDistance) {
            state.raceStarted = false; // Stop the loop from running race logic
            DOMElements.raceStatus.textContent = "Finished!";

            const runData = {
                runnerName: DOMElements.racerNameInput.value.trim(),
                totalTime: state.elapsedTime,
                checkpointTimes: state.checkpointTimes
            };
            FirebaseController.saveRun(state.course.id, runData);
        }
    }

    requestAnimationFrame(gameLoop);
}

// --- INITIALIZATION ---
function init() {
    UIController.init();
    FirebaseController.init().then(() => {
        UIController.loadCourses();
    });
    gameLoop();
}

init();