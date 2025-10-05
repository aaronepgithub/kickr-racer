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

        // --- Villain Logic ---
        state.villain.timeSinceLastVillian += deltaTime;

        // 1. Villain Spawning
        if (!state.villain.active && state.elapsedTime > state.villain.nextAppearanceTime && state.villain.timeSinceLastVillian > 30) {
            state.villain.active = true;
            state.villain.power = state.power;
            state.villain.distanceCovered = state.distanceCovered;
            state.villain.appearanceTime = state.elapsedTime;
            state.villain.timeSinceLastVillian = 0;
            // Appearance every 30 seconds, with up to 1 minute of randomness
            state.villain.nextAppearanceTime = state.elapsedTime + 30 + Math.random() * 60;
            console.log("Villain appeared!");
        }

        // 2. Villain Active Logic
        if (state.villain.active) {
            const timeSinceAppearance = state.elapsedTime - state.villain.appearanceTime;

            // Add power after 3 seconds
            if (timeSinceAppearance > 3) {
                state.villain.power = state.power + 20;
            }

            // Calculate villain's speed and distance
            const villainSpeedMps = PhysicsController.calculateSpeedMps(state.villain.power, state.gradient, state.riderWeightLbs);
            const villainSpeedMph = villainSpeedMps * 2.23694;
            if (villainSpeedMph > 0) {
                const villainDistanceThisFrame = (villainSpeedMph / 3600) * deltaTime;
                state.villain.distanceCovered += villainDistanceThisFrame;
            }

            // 3. Villain Despawning
            if (timeSinceAppearance > 20) {
                state.villain.active = false;
                console.log("Villain disappeared!");
            }
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
            state.targetGradient = currentPoint.gradient / 2; // Use 50% of the actual gradient
        }

        // Smooth the gradient for UI display
        const smoothingFactor = 0.05; // Lower is smoother
        state.gradient += (state.targetGradient - state.gradient) * smoothingFactor;
        state.gradientSamples.push(state.targetGradient);

        // Throttle bluetooth commands to every 5 seconds
        const GRADIENT_UPDATE_INTERVAL = 5000; // ms
        if (now - state.lastGradientUpdateTime > GRADIENT_UPDATE_INTERVAL) {
            if (state.gradientSamples.length > 0) {
                const averageGradient = state.gradientSamples.reduce((a, b) => a + b, 0) / state.gradientSamples.length;
                
                // Only send if the change is significant enough to matter
                if (Math.abs(averageGradient - state.lastSentAverageGradient) > 0.1) {
                    if (!state.simulator.active) {
                        BluetoothController.setGradient(averageGradient);
                    }
                    state.lastSentAverageGradient = averageGradient;
                }
                
                state.gradientSamples = []; // Clear samples for the next interval
                state.lastGradientUpdateTime = now;
            }
        }

        // --- Finish Race Logic ---
        // Check if the rider has finished
        if (state.distanceCovered >= state.totalDistance && !state.riderFinished) {
            state.riderFinished = true;
            UIController.updateRaceStatus("You've Finished! Waiting for ghost...");
            console.log("Rider finished the race.");

            const runData = {
                runnerName: DOMElements.racerNameInput.value.trim(),
                totalTime: state.elapsedTime,
                checkpointTimes: state.checkpointTimes
            };
            FirebaseController.saveRun(state.course.id, runData);
        }

        // Check if the ghost has finished
        if (state.course.recordRun && state.ghostDistanceCovered >= state.totalDistance && !state.ghostFinished) {
            state.ghostFinished = true;
            console.log("Ghost finished the race.");
        }

        // Check if both have finished to end the race
        if (state.riderFinished && (state.ghostFinished || !state.course.recordRun) && !state.raceFinished) {
            state.raceFinished = true; // Prevent this block from running multiple times
            state.raceStarted = false;
            UIController.updateRaceStatus("Race Complete!");
            console.log("Race complete! Notification should be visible.");
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
