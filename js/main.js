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

    // Always redraw the course profile in game view for a smooth scroll
    if (state.gameViewActive) {
        UIController.drawCourseProfile();
    }

    if (state.trainer.connected && state.raceStarted && state.gpxData) {
        // Use simulator power if active
        if (state.simulator.active) {
            state.power = state.simulator.power;
        }

        // --- Physics and State Updates ---
        const speedMps = PhysicsController.calculateSpeedMps(state.power, state.gradient, state.riderWeightLbs);
        state.speed = speedMps * 2.23694; // Convert m/s to mph
        state.elapsedTime += deltaTime;

        if (state.speed > 0) {
            const distanceThisFrame = (state.speed / 3600) * deltaTime; // distance in miles
            state.distanceCovered = Math.min(state.totalDistance, state.distanceCovered + distanceThisFrame);
        }

        // --- Ghost Position Calculation ---
        if (state.course.recordRun) {
            state.ghostDistanceCovered = PhysicsController.getGhostDistance(state.elapsedTime);
        }

        // --- UI Updates ---
        UIController.updatePower();
        UIController.updateSpeed();
        UIController.updateDistance();
        UIController.updateElapsedTime();
        UIController.updateRacerDots();
        UIController.updateGradient();

        // --- Ghost Time Diff Calculation ---
        if (state.course.recordRun && state.ghostDistanceCovered > 0) {
            const distanceDiff = state.distanceCovered - state.ghostDistanceCovered; // in miles
            let timeDiff = 0;
            if (state.speed > 1) {
                 const playerSpeedMph = state.speed;
                 const timeToCoverDiff_hours = distanceDiff / playerSpeedMph;
                 timeDiff = timeToCoverDiff_hours * 3600; // convert to seconds
            }
            UIController.updateGhostDiff(timeDiff);
        }

        // --- Checkpoint Logic for saving the run ---
        const nextCheckpoint = state.course.checkpoints[state.nextCheckpointIndex];
        if (nextCheckpoint && state.distanceCovered >= nextCheckpoint.distance) {
            state.checkpointTimes.push({
                percent: nextCheckpoint.percent,
                time: state.elapsedTime,
                distance: nextCheckpoint.distance
            });
            state.nextCheckpointIndex++;
        }

        // --- Gradient Updates ---
        const currentPoint = PhysicsController.getPointAtDistance(state.distanceCovered);
        if (currentPoint) {
            const newGradient = currentPoint.gradient / 2; // Use 50% of the actual gradient
            if (Math.abs(newGradient - state.gradient) > 0.1) {
                state.gradient = newGradient;
                // Only send bluetooth command if not in simulator mode
                if (!state.simulator.active) {
                    BluetoothController.setGradient(state.gradient);
                }
            }
        }

        // --- Finish Race Logic ---
        if (state.distanceCovered >= state.totalDistance && !state.raceFinished) {
            state.raceFinished = true; // Prevent this block from running multiple times
            state.raceStarted = false;
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
    gameLoop(); // Start the loop
}

init();
