import { state } from './state.js';
import { DOMElements } from './dom.js';
import { BluetoothController } from './bluetooth.js';
import { FirebaseController } from './firebase.js';
import { PhysicsController } from './physics.js';

export const UIController = {
    init() {
        DOMElements.connectBtn.addEventListener('click', () => BluetoothController.connect());
        DOMElements.gpxUpload.addEventListener('change', (event) => this.handleFileUpload(event));
        DOMElements.createRaceBtn.addEventListener('click', () => FirebaseController.createRace());
        DOMElements.copyLinkBtn.addEventListener('click', () => this.copyShareLink());
        DOMElements.weightInput.addEventListener('change', (e) => {
            state.riderWeightLbs = parseFloat(e.target.value) || 165;
        });
        DOMElements.startTimerControls.addEventListener('click', (e) => {
            if (e.target.classList.contains('start-time-btn')) {
                const minutes = parseInt(e.target.dataset.time, 10);
                FirebaseController.updateRaceStartTime(minutes);
            }
        });
        window.addEventListener('resize', () => this.drawCourseProfile());

        // Debug controls
        if (DOMElements.powerOffsetInput) {
            DOMElements.powerOffsetInput.value = state.trainer.powerOffset;
            DOMElements.powerOffsetInput.addEventListener('change', (e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v >= 0) {
                    state.trainer.powerOffset = v;
                    if (DOMElements.debugUsedOffset) DOMElements.debugUsedOffset.textContent = String(v);
                    console.log('Set preferred power offset to', v);
                }
            });
        }
        if (DOMElements.toggleDebugBtn && DOMElements.debugPanel) {
            DOMElements.toggleDebugBtn.addEventListener('click', () => {
                const isHidden = DOMElements.debugPanel.classList.contains('hidden');
                if (isHidden) {
                    DOMElements.debugPanel.classList.remove('hidden');
                    DOMElements.toggleDebugBtn.textContent = 'Hide';
                } else {
                    DOMElements.debugPanel.classList.add('hidden');
                    DOMElements.toggleDebugBtn.textContent = 'Show';
                }
            });
            // show panel by default when in development
            DOMElements.debugPanel.classList.remove('hidden');
        }
    },
    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        DOMElements.gpxFileName.textContent = file.name;
        const reader = new FileReader();
        reader.onload = (e) => {
            const result = PhysicsController.parseGPX(e.target.result);
            if (result) {
                state.gpxData = result.route;
                state.totalDistance = result.totalDistance;
                this.updateTotalDistance();
                this.drawCourseProfile();
                DOMElements.createRaceBtn.disabled = false;
            } else {
                DOMElements.gpxFileName.textContent = "Invalid GPX file";
            }
        };
        reader.readAsText(file);
    },
    updatePower() {
         DOMElements.powerDisplay.textContent = `${state.power} W`;
    },
    updateSpeed() {
        DOMElements.speedDisplay.textContent = `${state.speed.toFixed(1)} mph`;
    },
    updateDistance() {
         DOMElements.distanceDisplay.textContent = `${state.distanceCovered.toFixed(2)} mi`;
    },
    updateGradient() {
        DOMElements.gradientDisplay.textContent = `${state.gradient.toFixed(1)} %`;
    },
    updateTotalDistance() {
        DOMElements.totalDistanceDisplay.textContent = `${state.totalDistance.toFixed(2)} mi`;
    },
    startCountdown() {
        if (state.countdownInterval) clearInterval(state.countdownInterval);
        DOMElements.countdownSection.classList.remove('hidden');

        state.countdownInterval = setInterval(() => {
            const now = new Date();
            const diff = state.raceStartTime - now;

            if (diff <= 0) {
                DOMElements.countdownTimer.textContent = "GO!";
                DOMElements.countdownSection.classList.add('bg-green-600');
                 DOMElements.countdownSection.classList.remove('bg-gray-700');
                clearInterval(state.countdownInterval);
                state.raceStarted = true;
                DOMElements.raceStatus.textContent = 'Race in Progress';
                return;
            }

            const minutes = Math.floor(diff / 1000 / 60);
            const seconds = Math.floor(diff / 1000) % 60;

            DOMElements.countdownTimer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }, 1000);
    },
    updateLeaderboard() {
        DOMElements.leaderboard.innerHTML = '';
        const sortedRacers = Object.values(state.racers).sort((a, b) => b.distance - a.distance);

        if (sortedRacers.length === 0) {
             DOMElements.leaderboard.innerHTML = `<div class="bg-gray-700 p-3 rounded-lg"><p>Waiting for racers to join...</p></div>`;
             return;
        }

        sortedRacers.forEach(racer => {
            const isSelf = racer.id === state.userId;
            const racerEl = document.createElement('div');
            racerEl.className = `p-3 rounded-lg flex justify-between items-center ${isSelf ? 'bg-cyan-800 border border-cyan-500' : 'bg-gray-700'}`;
            racerEl.innerHTML = `
                <p class="text-sm font-semibold truncate w-1/3">${isSelf ? 'You' : racer.id.substring(0,8)}...</p>
                <p class="text-lg font-bold">${racer.distance.toFixed(2)} mi</p>
                <p class="text-md">${racer.speed.toFixed(1)} mph</p>
            `;
            DOMElements.leaderboard.appendChild(racerEl);
        });
    },
    drawCourseProfile() {
         if (!state.gpxData || state.gpxData.length === 0) return;
        const canvas = DOMElements.courseProfileCanvas;
        const ctx = canvas.getContext('2d');

        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const width = rect.width;
        const height = rect.height;

        const elevations = state.gpxData.map(p => p.ele);

        const maxEle = Math.max(...elevations);
        const minEle = Math.min(...elevations);
        const eleRange = maxEle - minEle === 0 ? 1 : maxEle - minEle;
        const padding = 20;

        ctx.clearRect(0, 0, width, height);

        ctx.beginPath();
        ctx.moveTo(0, height - (((elevations[0] - minEle) / eleRange) * (height - padding * 2) + padding));
        for (let i = 1; i < state.gpxData.length; i++) {
            const segment = state.gpxData[i];
            const x = (segment.startDistance / state.totalDistance) * width;
            const y = height - (((segment.ele - minEle) / eleRange) * (height - padding * 2) + padding);
            ctx.lineTo(x, y);
        }
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();

        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, 'rgba(45, 212, 191, 0.5)');
        gradient.addColorStop(1, 'rgba(34, 41, 57, 0.1)');
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(0, height - (((elevations[0] - minEle) / eleRange) * (height - padding * 2) + padding));
         for (let i = 1; i < state.gpxData.length; i++) {
            const segment = state.gpxData[i];
            const x = (segment.startDistance / state.totalDistance) * width;
            const y = height - (((segment.ele - minEle) / eleRange) * (height - padding * 2) + padding);
            ctx.lineTo(x, y);
        }
        ctx.strokeStyle = '#2dd4bf';
        ctx.lineWidth = 2;
        ctx.stroke();
    },
    updateRacerDots() {
        if (!state.totalDistance || state.totalDistance === 0) return;

        Object.values(state.racers).forEach(racer => {
            let dot = document.getElementById(`dot-${racer.id}`);
            if (!dot) {
                dot = document.createElement('div');
                dot.id = `dot-${racer.id}`;
                dot.className = 'race-dot absolute w-3 h-3 rounded-full border-2';
                dot.style.transform = 'translateY(-50%)';
                DOMElements.courseProfileContainer.appendChild(dot);
            }

            const percentComplete = (racer.distance / state.totalDistance);
            const currentPos = state.totalDistance * percentComplete;
            let segmentIndex = state.gpxData.findIndex(p => p.startDistance <= currentPos && (p.startDistance + p.distance) > currentPos);

            if (segmentIndex === -1 && state.gpxData.length > 1) {
                segmentIndex = state.gpxData.length - 2;
            } else if (segmentIndex === -1 || !state.gpxData[segmentIndex + 1]) {
                 segmentIndex = state.gpxData.length -2;
                 if (segmentIndex < 0) return; // Not enough data to draw dot
            }

            const p1 = state.gpxData[segmentIndex];
            const p2 = state.gpxData[segmentIndex + 1];

            if (p1 && p2) {
                const segmentDist = p2.startDistance - p1.startDistance;
                const distIntoSegment = currentPos - p1.startDistance;
                const percentIntoSegment = segmentDist > 0 ? distIntoSegment / segmentDist : 0;

                const interpolatedEle = p1.ele + (p2.ele - p1.ele) * percentIntoSegment;

                const elevations = state.gpxData.map(p => p.ele);
                const maxEle = Math.max(...elevations);
                const minEle = Math.min(...elevations);
                const eleRange = maxEle - minEle === 0 ? 1 : maxEle - minEle;
                const padding = 20;

                const rect = DOMElements.courseProfileCanvas.getBoundingClientRect();
                const yPercent = 1 - ((interpolatedEle - minEle) / eleRange);
                const topPx = yPercent * (rect.height - padding * 2) + padding;

                dot.style.top = `${topPx}px`;
            }

            const isSelf = racer.id === state.userId;
            dot.style.backgroundColor = isSelf ? '#2dd4bf' : '#f87171';
            dot.style.borderColor = isSelf ? '#fff' : '#000';
            dot.style.zIndex = isSelf ? '10' : '5';
            dot.style.left = `calc(${percentComplete * 100}% - 6px)`;
        });
    },
    showShareLink(raceId) {
        const baseUrl = window.location.href.split('?')[0];
        const url = `${baseUrl}?raceId=${raceId}`;
        DOMElements.shareLinkInput.value = url;
        DOMElements.shareLinkSection.classList.remove('hidden');
    },
    copyShareLink() {
        DOMElements.shareLinkInput.select();
        document.execCommand('copy');
        DOMElements.copyLinkBtn.textContent = 'Copied!';
        setTimeout(() => { DOMElements.copyLinkBtn.textContent = 'Copy'; }, 2000);
    }
};
