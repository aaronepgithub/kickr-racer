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

        state.gradientBuffer.push(state.gradient);
        if (timestamp - state.lastGradientUpdateTime > 10000) { // 10 seconds
            const avgGradient = state.gradientBuffer.reduce((a, b) => a + b, 0) / state.gradientBuffer.length;
            if (state.trainer.connected && !state.simulator.active && state.gradientBuffer.length > 0) {
                BluetoothController.setGradient(avgGradient);
            }
            state.gradientBuffer = [];
            state.lastGradientUpdateTime = timestamp;
        }

        const speedMps = PhysicsController.calculateSpeedMps(state.power, state.gradient, state.riderWeightLbs);
        state.speed = speedMps * 2.23694; // m/s to mph
        state.distanceCovered += (state.speed * 1.60934 / 3600) * deltaTime; // distance in miles

        if (state.course.checkpoints && state.nextCheckpointIndex < state.course.checkpoints.length) {
            const nextCheckpoint = state.course.checkpoints[state.nextCheckpointIndex];
            if (state.distanceCovered >= nextCheckpoint.distance) {
                state.checkpointTimes.push({ distance: nextCheckpoint.distance, time: state.elapsedTime });
                state.nextCheckpointIndex++;
            }
        }

        if (state.course && state.course.recordRun) {
            state.ghostDistanceCovered = PhysicsController.getGhostDistance(state.elapsedTime);
            
            if (state.ghostDistanceCovered >= state.totalDistance && !state.ghostFinished) {
                state.ghostFinished = true;
                state.ghostFinishTime = state.course.recordRun.totalTime;
                const statusEl = state.gameViewActive ? document.querySelector('#game-race-display #race-status') : document.getElementById('race-status');
                if(statusEl) statusEl.textContent = `Ghost finished in ${UIController.formatTime(state.ghostFinishTime)}!`
            }

            if (!state.raceFinished && !state.ghostFinished) {
                const ghostTimeAtUserDistance = PhysicsController.getGhostTimeAtDistance(state.distanceCovered);
                const diff = state.elapsedTime - ghostTimeAtUserDistance;
                UIController.updateGhostDiff(diff);
            }
        }

        if (state.distanceCovered >= state.totalDistance) {
            state.raceFinished = true;
            const statusEl = state.gameViewActive ? document.querySelector('#game-race-display #race-status') : document.getElementById('race-status');
            if(statusEl) statusEl.textContent = "You Finished!";

            const isNewRecord = !state.course.recordRun || state.elapsedTime < state.course.recordRun.totalTime;
            if (isNewRecord) {
                if(statusEl) statusEl.textContent = "New Record!";
                const raceData = {
                    runnerName: document.getElementById('racer-name-input').value,
                    totalTime: state.elapsedTime,
                    checkpointTimes: state.checkpointTimes
                };
                await FirebaseController.saveRaceResult(state.course.id, raceData);
            }
        }
    }

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


async function main() {
    await FirebaseController.init();
    UIController.init();

    const courses = await FirebaseController.getCourses();
    UIController.loadCourses(courses);

    document.addEventListener('course-upload', async (e) => {
        const gpxData = e.detail;
        const gpxFileName = document.getElementById('gpx-file-name');

        gpxFileName.textContent = "Uploading...";
        const courseId = await FirebaseController.uploadCourse(gpxData);

        if (courseId) {
            gpxFileName.textContent = "Uploaded!";
            const updatedCourses = await FirebaseController.getCourses();
            UIController.loadCourses(updatedCourses);
            const newCourse = updatedCourses.find(c => c.id === courseId);
            if (newCourse) {
                UIController.selectCourse(newCourse);
            }
        } else {
            gpxFileName.textContent = "Upload failed.";
        }
    });

    requestAnimationFrame(gameLoop);
}

document.addEventListener('DOMContentLoaded', main);
