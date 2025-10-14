import { state } from './state.js';
import { DOMElements } from './dom.js';
import { FirebaseController } from './firebase.js';
import { BluetoothController } from './bluetooth.js';
import { PhysicsController } from './physics.js';
import { UIController } from './ui.js';
import { villains } from './config.js';

// --- Helper Functions ---
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

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
        const baseVillain = villains.rouleur; // For shared properties like cooldown

        // 1. Villain Spawning
        if (!state.villain.active) {
            state.villain.timeUntilNext -= deltaTime;
            if (state.villain.timeUntilNext <= 0) {
                const villainKeys = Object.keys(villains);
                const randomVillainKey = villainKeys[Math.floor(Math.random() * villainKeys.length)];
                const villain = villains[randomVillainKey];

                state.villain.active = true;
                state.villain.name = villain.name;
                state.villain.power = state.power + villain.powerBoost;
                state.villain.powerBoost = villain.powerBoost;
                state.villain.timeRemaining = villain.duration;
                state.villain.emoji = villain.emoji;
                state.villain.originalEmoji = villain.emoji;
                state.villain.distanceCovered = state.distanceCovered;
                console.log(`A ${villain.name} appears!`);
            }
        }

        // 2. Villain Active Logic
        if (state.villain.active) {
            state.villain.timeRemaining -= deltaTime;

            // Calculate distance to player
            const distMiles = state.distanceCovered - state.villain.distanceCovered;
            state.villain.distanceToPlayer = distMiles * 1609.34; // convert to meters

            // Award drafting points
            if (state.villain.distanceToPlayer >= -3 && state.villain.distanceToPlayer < 0) {
                state.points += 10 * deltaTime;
                state.villain.drafting = true;
                state.villain.emoji = '💨';
            } else {
                state.villain.drafting = false;
                state.villain.emoji = state.villain.originalEmoji;
            }

            // Calculate villain's speed and distance
            const villainSpeedMps = PhysicsController.calculateSpeedMps(state.villain.power, state.gradient, state.riderWeightLbs);
            const villainSpeedMph = villainSpeedMps * 2.23694;
            if (villainSpeedMph > 0) {
                const villainDistanceThisFrame = (villainSpeedMph / 3600) * deltaTime;
                state.villain.distanceCovered += villainDistanceThisFrame;
            }

            // 3. Villain Despawning
            if (state.villain.timeRemaining <= 0) {
                state.villain.active = false;
                state.villain.timeUntilNext = getRandomInt(15, 45); // Use random cooldown
                console.log(`The ${state.villain.name} fades away.`);
            }
        }

        // --- UI Updates ---
        UIController.updatePower();
        UIController.updateSpeed();
        UIController.updateDistance();
        UIController.updateElapsedTime();
        UIController.updatePoints();
        UIController.updateRacerDots();
        UIController.updateGradient();
        UIController.updateVillainDisplay();

        // --- Ghost Distance Calculation ---
        if (state.course.recordRun) {
            UIController.updateGhostDistance();
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

        // --- ERG Mode Logic ---
        if (state.ergMode.active) {
            let targetWatts = state.ergMode.zone2Watts;
            if (state.villain.active) {
                targetWatts += state.villain.powerBoost / 2;
            }

            // Smoothly adjust the target watts
            const smoothingFactor = 0.05; // Lower is smoother
            state.ergMode.targetWatts += (targetWatts - state.ergMode.targetWatts) * smoothingFactor;

            const ERG_UPDATE_INTERVAL = 1000; // ms
            if (now - state.ergMode.lastErgUpdateTime > ERG_UPDATE_INTERVAL) {
                const roundedTargetWatts = Math.round(state.ergMode.targetWatts);
                if (Math.abs(roundedTargetWatts - state.ergMode.lastSentErgWatts) > 1) {
                    if (!state.simulator.active) {
                        BluetoothController.setErgMode(roundedTargetWatts);
                    }
                    state.ergMode.lastSentErgWatts = roundedTargetWatts;
                    state.ergMode.lastErgUpdateTime = now;
                }
            }
        }

        // --- Gradient Updates ---
        if (!state.ergMode.active) { // Only run gradient simulation if ERG mode is off
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
                            const gradientToSend = Math.max(0, averageGradient);
                            BluetoothController.setGradient(gradientToSend);
                        }
                        state.lastSentAverageGradient = averageGradient;
                    }
                    
                    state.gradientSamples = []; // Clear samples for the next interval
                    state.lastGradientUpdateTime = now;
                }
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

            if (!state.course.highScore || state.points > state.course.highScore.points) {
                const highScoreData = {
                    name: DOMElements.racerNameInput.value.trim(),
                    points: state.points
                };
                FirebaseController.saveHighScore(state.course.id, highScoreData);
            }
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
