import { state } from './state.js';
import { UIController } from './ui.js';
import { PhysicsController } from './physics.js';
import { BluetoothController } from './bluetooth.js';
import { FirebaseController } from './firebase.js';

let lastTimestamp = 0;

async function gameLoop(timestamp) {
    if (!lastTimestamp) {
        lastTimestamp = timestamp;
        requestAnimationFrame(gameLoop);
        return;
    }

    const deltaTime = (timestamp - lastTimestamp) / 1000; // seconds
    lastTimestamp = timestamp;

    if (state.raceStarted && !state.raceFinished) {
        state.elapsedTime += deltaTime;

        const currentPos = PhysicsController.getPointAtDistance(state.distanceCovered);
        if (currentPos) {
            state.gradient = currentPos.gradient;
        }

        // --- Gradient Throttling ---
        state.gradientBuffer.push(state.gradient);
        if (timestamp - state.lastGradientUpdateTime > 10000) { // 10 seconds
            const avgGradient = state.gradientBuffer.reduce((a, b) => a + b, 0) / state.gradientBuffer.length;
            if (state.trainer.connected && !state.simulator.active) {
                BluetoothController.setGradient(avgGradient);
            }
            state.gradientBuffer = [];
            state.lastGradientUpdateTime = timestamp;
        }

        // In simulator mode, power is controlled by keys. Otherwise, it's read from the trainer.
        if (state.simulator.active) {
            // Power is already set in state via keydown events
        } else {
            // Power is updated by the Bluetooth controller
        }

        const speedMps = PhysicsController.calculateSpeedMps(state.power, state.gradient, state.riderWeightLbs);
        state.speed = speedMps * 2.23694; // m/s to mph
        state.distanceCovered += (state.speed * 1.60934 / 3600) * deltaTime; // distance in miles

        // --- Checkpoint Tracking ---
        if (state.course.checkpoints && state.nextCheckpointIndex < state.course.checkpoints.length) {
            const nextCheckpoint = state.course.checkpoints[state.nextCheckpointIndex];
            if (state.distanceCovered >= nextCheckpoint.distance) {
                state.checkpointTimes.push({ distance: nextCheckpoint.distance, time: state.elapsedTime });
                state.nextCheckpointIndex++;
            }
        }

        // --- Ghost Logic ---
        if (state.course && state.course.recordRun) {
            state.ghostDistanceCovered = PhysicsController.getGhostDistance(state.elapsedTime);
            
            if (state.ghostDistanceCovered >= state.totalDistance && !state.ghostFinished) {
                state.ghostFinished = true;
                state.ghostFinishTime = state.course.recordRun.totalTime;
                const statusEl = state.gameViewActive ? document.querySelector('#game-race-display #race-status') : document.getElementById('race-status');
                if(statusEl) statusEl.textContent = `Ghost finished in ${UIController.formatTime(state.ghostFinishTime)}!`
            }

            if (!state.ghostFinished) {
                const ghostTimeAtUserDistance = PhysicsController.getGhostTimeAtDistance(state.distanceCovered);
                const diff = state.elapsedTime - ghostTimeAtUserDistance;
                UIController.updateGhostDiff(diff);
            }
        }

        // --- Finish Line Logic ---
        if (state.distanceCovered >= state.totalDistance) {
            state.raceFinished = true;
            
            const statusEl = state.gameViewActive ? document.querySelector('#game-race-display #race-status') : document.getElementById('race-status');
            if(statusEl) statusEl.textContent = "You Finished!";

            const isNewRecord = !state.course.recordRun || state.elapsedTime < state.course.recordRun.totalTime;
            if (isNewRecord) {
                if(statusEl) statusEl.textContent = "New Record!";
                const raceData = {
                    runnerName: state.racerName,
                    totalTime: state.elapsedTime,
                    checkpointTimes: state.checkpointTimes
                };
                await FirebaseController.saveRaceResult(state.course.id, raceData);
            }
        }
    }

    // --- UI Updates ---
    if (state.raceStarted) {
        UIController.updatePower();
        UIController.updateSpeed();
        UIController.updateDistance();
        UIController.updateGradient();
        UIController.updateElapsedTime();
        UIController.drawCourseProfile();
        UIController.updateRacerDots();
    }

    requestAnimationFrame(gameLoop);
}

document.addEventListener('DOMContentLoaded', () => {
    UIController.init();
    requestAnimationFrame(gameLoop);
});
