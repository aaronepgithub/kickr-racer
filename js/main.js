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

        // --- Ghost Position Calculation ---
        if (state.course.recordRun && state.course.recordRun.checkpointTimes) {
            const recordTimes = [{ percent: 0, time: 0, distance: 0 }, ...state.course.recordRun.checkpointTimes];
            let ghostSegmentIndex = recordTimes.findIndex(ct => ct.time > state.elapsedTime) - 1;

            if (ghostSegmentIndex === -2) { // Race finished for ghost
                ghostSegmentIndex = recordTimes.length - 2;
            }
             if (ghostSegmentIndex < 0) {
                 ghostSegmentIndex = 0;
            }

            if (ghostSegmentIndex < recordTimes.length - 1) {
                const startCp = recordTimes[ghostSegmentIndex];
                const endCp = recordTimes[ghostSegmentIndex + 1];
                const timeInSegment = state.elapsedTime - startCp.time;
                const segmentDuration = endCp.time - startCp.time;
                const segmentDistance = endCp.distance - startCp.distance;

                if (segmentDuration > 0) {
                    const progressInSegment = timeInSegment / segmentDuration;
                    state.ghostDistanceCovered = startCp.distance + (progressInSegment * segmentDistance);
                } else {
                     state.ghostDistanceCovered = startCp.distance;
                }
            } else {
                // If ghost has finished, keep them at the end
                state.ghostDistanceCovered = state.totalDistance;
            }
        }

        // --- Checkpoint and Ghost Time Diff Logic ---
        const nextCheckpoint = state.course.checkpoints[state.nextCheckpointIndex];
        if (nextCheckpoint && state.distanceCovered >= nextCheckpoint.distance) {
            state.checkpointTimes.push({
                percent: nextCheckpoint.percent,
                time: state.elapsedTime,
                distance: nextCheckpoint.distance
            });
            state.nextCheckpointIndex++;
        }

        // Continuous ghost diff update
        if (state.course.recordRun && state.course.recordRun.checkpointTimes.length > 0 && state.distanceCovered > 0) {
            const recordTimes = [{ percent: 0, time: 0, distance: 0 }, ...state.course.recordRun.checkpointTimes];
            let playerSegmentIndex = recordTimes.findIndex(ct => ct.distance > state.distanceCovered) - 1;
            let ghostTimeAtPlayerDistance;

            if (playerSegmentIndex === -2) { // Player is past the last checkpoint
                ghostTimeAtPlayerDistance = state.course.recordRun.totalTime;
            } else {
                if (playerSegmentIndex < 0) {
                    playerSegmentIndex = 0;
                }
                const startCp = recordTimes[playerSegmentIndex];
                const endCp = recordTimes[playerSegmentIndex + 1];
                const distanceInSegment = endCp.distance - startCp.distance;
                const playerDistanceIntoSegment = state.distanceCovered - startCp.distance;

                if (distanceInSegment > 0) {
                    const progressInSegment = playerDistanceIntoSegment / distanceInSegment;
                    const timeInSegment = endCp.time - startCp.time;
                    ghostTimeAtPlayerDistance = startCp.time + (progressInSegment * timeInSegment);
                } else {
                    ghostTimeAtPlayerDistance = startCp.time;
                }
            }
            const timeDiff = state.elapsedTime - ghostTimeAtPlayerDistance;
            UIController.updateGhostDiff(timeDiff);
        }

        // --- Gradient Updates ---
        (async () => {
            let currentSegment = state.gpxData.find(s => state.distanceCovered >= s.startDistance && state.distanceCovered < (s.startDistance + s.distance));
            if (currentSegment) {
                const newGradient = currentSegment.gradient;
                if (Math.abs(newGradient - state.gradient) > 0.1) {
                    state.gradient = newGradient;
                    await BluetoothController.setGradient(state.gradient);
                    UIController.updateGradient();
                }
            }
        })();

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

