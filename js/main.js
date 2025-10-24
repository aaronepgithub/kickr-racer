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

    if ((state.trainer.connected || state.powerMeter.connected) && state.raceStarted && state.gpxData) {
        // Use simulator power if active
        if (state.simulator.active) {
            state.power = state.simulator.power;

            const targetSpeedMps = state.simulator.targetSpeed / 2.23694;
            const targetPower = PhysicsController.calculatePowerForTargetSpeed(targetSpeedMps, state.gradient, state.riderWeightLbs);
            const actualPower = state.power;
            const powerDifference = Math.abs(targetPower - actualPower);

            const maxPoints = 10;
            const maxPowerDifference = 100; // Points scale down to 0 over this difference
            let points = 0;
            if (powerDifference < maxPowerDifference) {
                points = maxPoints * (1 - (powerDifference / maxPowerDifference));
            }

            // Make points harder to earn in simulator mode by scaling
            const simScale = state.simulator.active ? state.simulator.pointsScale : 1;
            state.points += points * deltaTime * state.pointsMultiplier * simScale;
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
                // Increase villain power slightly in simulator mode for a tougher challenge
                const aggressiveness = state.simulator.active ? state.simulator.villainAggressiveness : 1;
                state.villain.power = state.power + villain.powerBoost * aggressiveness;
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

            // Award drafting points (tighter window and scaled rewards in simulator mode)
            const draftWindow = state.simulator.active ? -1 : -3; // meters behind
            const draftBasePoints = 10 * (state.simulator.active ? state.simulator.pointsScale : 1);
            if (state.villain.distanceToPlayer >= draftWindow && state.villain.distanceToPlayer < 0) {
                state.points += draftBasePoints * deltaTime;
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
                // Simulator mode spawns villains more often
                state.villain.timeUntilNext = state.simulator.active ? getRandomInt(10, 30) : getRandomInt(15, 45);
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
        UIController.updateCadence(); // new: show current cadence in HUD

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
                // Use a smaller, smoothed gradient for trainer mode but amplify for simulator for drama
                const gradientFactor = state.simulator.active ? state.simulator.elevationAmplifier : 0.5;
                state.targetGradient = currentPoint.gradient * gradientFactor;
            }

            // Throttle bluetooth commands to every 10 seconds
            const GRADIENT_UPDATE_INTERVAL = 10000; // ms
            if (now - state.lastGradientUpdateTime > GRADIENT_UPDATE_INTERVAL) {
                state.gradient = state.targetGradient;
                // Only send if the change is significant enough to matter
                if (Math.abs(state.gradient - state.lastSentAverageGradient) > 0.1) {
                    if (!state.simulator.active && state.trainer.connected) {
                        const gradientToSend = Math.max(0, state.gradient);
                        BluetoothController.setGradient(gradientToSend);
                    }
                    state.lastSentAverageGradient = state.gradient;
                }
                
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
            state.music.pause();
            UIController.updateRaceStatus("Race Complete!");
            console.log("Race complete! Notification should be visible.");
        }

    }

    requestAnimationFrame(gameLoop);
} // end of gameLoop


// --- INITIALIZATION ---
function init() {
    UIController.init();
    FirebaseController.init().then(() => {
        UIController.loadCourses();
    });
    gameLoop(); // Start the loop
}

init();
