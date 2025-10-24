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

function recommendGear(gradient, cadence) {
    let gear;
    if (gradient < -3) gear = 3;
    else if (gradient < -1) gear = 5;
    else if (gradient < 1) gear = 6;
    else if (gradient < 3) gear = 8;
    else if (gradient < 6) gear = 10;
    else gear = 12;

    if (cadence > 92) gear = Math.max(1, gear - 1);
    if (cadence < 88) gear = Math.min(12, gear + 1);
    return gear;
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
            state.power = Math.round(state.simulator.power * state.shiftAssist.penaltyMultiplier);
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
                state.targetGradient = currentPoint.gradient / 2; // Use 50% of the actual gradient
            }

            // Smooth the gradient for UI display
            const smoothingFactor = 0.05; // Lower is smoother
            state.gradient += (state.targetGradient - state.gradient) * smoothingFactor;
            state.gradientSamples.push(state.targetGradient);

            // Trigger Perfect Shift window on meaningful gradient change
            const gradientDelta = state.targetGradient - state.shiftAssist.lastTargetGradient;
            if (Math.abs(gradientDelta) >= 0.5 && !state.shiftAssist.windowActive) {
                // Automatically adjust cadence due to road gradient change
                if (state.simulator.active) {
                    const cadenceDelta = -gradientDelta * 1.5; // climb => cadence drops, descent => cadence rises
                    state.simulator.cadence = Math.max(85, Math.min(100, Math.round(state.simulator.cadence + cadenceDelta)));
                    UIController.updateSimulatorUI(); // keep sliders/labels in sync
                    UIController.updateCadence();
                }

                state.shiftAssist.recommendedGear = recommendGear(state.targetGradient, state.simulator.cadence);
                state.shiftAssist.windowActive = true;
                state.shiftAssist.windowEndTime = Date.now() + 2000; // 2s window
                state.shiftAssist.success = false;
                UIController.showShiftWindow(state.shiftAssist.recommendedGear);
            }
            state.shiftAssist.lastTargetGradient = state.targetGradient;

            // Check shift success/miss during active window
            if (state.shiftAssist.windowActive) {
                if (state.simulator.active &&
                    state.simulator.gear === state.shiftAssist.recommendedGear &&
                    !state.shiftAssist.success) {
                    state.points += 20; // reward for perfect shift
                    state.shiftAssist.success = true;
                    state.shiftAssist.windowActive = false;
                    UIController.showShiftSuccess();
                } else if (Date.now() >= state.shiftAssist.windowEndTime) {
                    state.shiftAssist.windowActive = false;
                    if (!state.shiftAssist.success) {
                        // Apply temporary penalty
                        state.shiftAssist.penaltyActive = true;
                        state.shiftAssist.penaltyMultiplier = 0.9; // -10% effective power
                        state.shiftAssist.penaltyEndTime = Date.now() + 5000; // 5s
                        UIController.showShiftMiss();
                    }
                }
            }

            // Throttle bluetooth commands to every 5 seconds
            const GRADIENT_UPDATE_INTERVAL = 5000; // ms
            if (now - state.lastGradientUpdateTime > GRADIENT_UPDATE_INTERVAL) {
                if (state.gradientSamples.length > 0) {
                    const averageGradient = state.gradientSamples.reduce((a, b) => a + b, 0) / state.gradientSamples.length;
                    
                    // Only send if the change is significant enough to matter
                    if (Math.abs(averageGradient - state.lastSentAverageGradient) > 0.1) {
                        if (!state.simulator.active && state.trainer.connected) {
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

        // Decay/clear penalty if time elapsed
        if (state.shiftAssist.penaltyActive && Date.now() >= state.shiftAssist.penaltyEndTime) {
            state.shiftAssist.penaltyActive = false;
            state.shiftAssist.penaltyMultiplier = 1.0;
        }

        // Throttle bluetooth commands to every 5 seconds
        const GRADIENT_UPDATE_INTERVAL = 5000; // ms
        if (now - state.lastGradientUpdateTime > GRADIENT_UPDATE_INTERVAL) {
            if (state.gradientSamples.length > 0) {
                const averageGradient = state.gradientSamples.reduce((a, b) => a + b, 0) / state.gradientSamples.length;
                
                // Only send if the change is significant enough to matter
                if (Math.abs(averageGradient - state.lastSentAverageGradient) > 0.1) {
                    if (!state.simulator.active && state.trainer.connected) {
                        const gradientToSend = Math.max(0, averageGradient);
                        BluetoothController.setGradient(gradientToSend);
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
