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

        // --- Checkpoint Logic ---
        const nextCheckpoint = state.course.checkpoints[state.nextCheckpointIndex];
        if (nextCheckpoint && state.distanceCovered >= nextCheckpoint.distance) {
            state.checkpointTimes.push({
                percent: nextCheckpoint.percent,
                time: state.elapsedTime,
                distance: nextCheckpoint.distance
            });
            state.nextCheckpointIndex++;
        }

        // --- Ghost Time Diff Calculation ---
        if (state.course.recordRun && state.ghostDistanceCovered > 0) {
            const distanceDiff = state.ghostDistanceCovered - state.distanceCovered; // in miles

            let timeDiff = 0;
            // To avoid wild fluctuations, only calculate time diff when speed is reasonable
            if (state.speed > 1) {
                 const playerSpeedMph = state.speed;
                 const timeToCoverDiff_hours = distanceDiff / playerSpeedMph;
                 timeDiff = timeToCoverDiff_hours * 3600; // convert to seconds
            }

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

