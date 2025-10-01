import { state } from './state.js';
import { DOMElements } from './dom.js';
import { BluetoothController } from './bluetooth.js';
import { FirebaseController } from './firebase.js';
import { PhysicsController } from './physics.js';

// --- CONSTANTS FOR GAME VIEW ---
const GAME_VIEW_DISTANCE = 0.5; // miles
const RIDER_POSITION_PERCENT = 20; // Rider is 20% from the left edge

export const UIController = {
    init() {
        state.riderWeightLbs = parseInt(DOMElements.racerWeightInput.value, 10);

        DOMElements.connectBtn.addEventListener('click', () => BluetoothController.connect());
        DOMElements.simulatorBtn.addEventListener('click', () => this.toggleSimulator());
        DOMElements.fullscreenBtn.addEventListener('click', () => this.enterGameView());
        DOMElements.gpxUpload.addEventListener('change', (event) => this.handleFileUpload(event));
        DOMElements.racerNameInput.addEventListener('input', () => this.updateStartRaceButtonState());
        DOMElements.racerWeightInput.addEventListener('input', (e) => {
            state.riderWeightLbs = parseInt(e.target.value, 10);
            this.updateStartRaceButtonState();
        });
        DOMElements.startRaceBtn.addEventListener('click', () => this.startRace());

        document.addEventListener('keydown', (e) => {
            if (state.simulator.active) {
                if (e.key === 'ArrowUp') state.simulator.power += 10;
                else if (e.key === 'ArrowDown') state.simulator.power = Math.max(0, state.simulator.power - 10);
                this.updateSimPowerDisplay();
            }
        });

        this.loadCourses();
        this.updateStartRaceButtonState();
        this.drawCourseProfile();
    },

    toggleSimulator() {
        state.simulator.active = !state.simulator.active;
        if (state.simulator.active) {
            DOMElements.simulatorControls.classList.remove('hidden');
            DOMElements.bluetoothStatus.textContent = "Simulator Active";
            DOMElements.bluetoothStatus.classList.add("text-purple-400");
            DOMElements.bluetoothStatus.classList.remove("text-red-400");
            state.trainer.connected = true;
            DOMElements.connectBtn.classList.add('hidden');
            DOMElements.simulatorBtn.textContent = "Disable Simulator";
        } else {
            DOMElements.simulatorControls.classList.add('hidden');
            DOMElements.bluetoothStatus.textContent = "Disconnected";
            DOMElements.bluetoothStatus.classList.add("text-red-400");
            DOMElements.bluetoothStatus.classList.remove("text-purple-400");
            state.trainer.connected = false;
            DOMElements.connectBtn.classList.remove('hidden');
            DOMElements.simulatorBtn.textContent = "Use Simulator";
        }
        this.updateStartRaceButtonState();
    },

    updateSimPowerDisplay() {
        DOMElements.simPowerDisplay.textContent = `${state.simulator.power} W`;
    },

    async loadCourses() {
        DOMElements.courseList.innerHTML = '<p>Loading courses...</p>';
        const courses = await FirebaseController.getCourses();
        DOMElements.courseList.innerHTML = '';
        if (courses.length === 0) {
            DOMElements.courseList.innerHTML = '<p>No courses found.</p>';
            return;
        }
        courses.forEach(course => {
            const courseEl = document.createElement('div');
            courseEl.className = 'p-3 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-700';
            courseEl.textContent = course.name;
            courseEl.addEventListener('click', () => this.selectCourse(course));
            DOMElements.courseList.appendChild(courseEl);
        });
    },

    selectCourse(course) {
        state.course = course;
        state.gpxData = JSON.parse(course.gpx);
        state.totalDistance = course.totalDistance;

        if (state.course.recordRun && state.course.recordRun.checkpointTimes) {
            state.course.recordRun.checkpointTimes.forEach(cp => {
                if (cp.distance === undefined) {
                    cp.distance = cp.mile * state.totalDistance;
                }
            });
        }

        Array.from(DOMElements.courseList.children).forEach(c => c.classList.remove('bg-cyan-700'));
        const selectedEl = Array.from(DOMElements.courseList.children).find(c => c.textContent === course.name);
        if (selectedEl) selectedEl.classList.add('bg-cyan-700');

        this.drawCourseProfile();
        this.displayRecordTimes();
        this.updateStartRaceButtonState();
        DOMElements.raceStatus.textContent = `${course.name} selected.`;
    },

    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        DOMElements.gpxFileName.textContent = `Parsing ${file.name}...`;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const result = PhysicsController.parseGPX(e.target.result, file.name);
            if (!result) {
                DOMElements.gpxFileName.textContent = "Invalid GPX file";
                return;
            }
            DOMElements.gpxFileName.textContent = "Uploading...";
            const courseId = await FirebaseController.uploadCourse(result);
            if (courseId) {
                DOMElements.gpxFileName.textContent = "Uploaded!";
                await this.loadCourses();
                const courses = await FirebaseController.getCourses();
                const newCourse = courses.find(c => c.id === courseId);
                if (newCourse) this.selectCourse(newCourse);
            } else {
                DOMElements.gpxFileName.textContent = "Upload failed.";
            }
        };
        reader.readAsText(file);
    },

    startRace() {
        DOMElements.preRaceSetup.classList.add('hidden');
        if (!state.gameViewActive) {
            DOMElements.raceDisplay.classList.remove('hidden');
        }
        DOMElements.countdownSection.classList.remove('hidden');
        DOMElements.fullscreenBtn.classList.remove('hidden');
        this.startCountdown();
    },

    enterGameView() {
        state.gameViewActive = true;
        const gameView = DOMElements.gameView;
        const mainContent = DOMElements.mainContent;

        const raceDisplay = DOMElements.raceDisplay.cloneNode(true);
        const courseProfile = DOMElements.courseProfileSection.cloneNode(true);

        raceDisplay.id = 'game-race-display';
        courseProfile.id = 'game-course-profile';

        const title = courseProfile.querySelector('h3');
        if (title) title.remove();

        gameView.innerHTML = '';
        gameView.appendChild(courseProfile);
        gameView.appendChild(raceDisplay);

        courseProfile.className = 'relative w-full h-full';
        const canvas = courseProfile.querySelector('canvas');
        canvas.className = 'w-full h-full';

        raceDisplay.className = 'absolute top-4 left-4 grid grid-cols-3 md:grid-cols-5 gap-4 bg-gray-900 bg-opacity-70 p-4 rounded-lg';

        mainContent.classList.add('hidden');
        gameView.classList.remove('hidden');
        
        // The game loop will now handle drawing, which ensures canvas is ready.

        if (gameView.requestFullscreen) {
            gameView.requestFullscreen().catch(err => console.error(`Fullscreen error: ${err.message}`));
        }
    },

    updateStartRaceButtonState() {
        const canStart = DOMElements.racerNameInput.value.trim() !== '' &&
                         DOMElements.racerWeightInput.value > 0 &&
                         state.course !== null &&
                         state.trainer.connected;
        DOMElements.startRaceBtn.disabled = !canStart;
    },

    displayRecordTimes() {
        const record = state.course ? state.course.recordRun : null;
        if (record) {
            DOMElements.recordHolderName.textContent = record.runnerName;
            DOMElements.recordHolderTime.textContent = this.formatTime(record.totalTime);
        } else {
            DOMElements.recordHolderName.textContent = 'N/A';
            DOMElements.recordHolderTime.textContent = 'N/A';
        }
    },

    updateGhostDiff(diffSeconds) {
        const sign = diffSeconds >= 0 ? '+' : '-';
        const absDiff = Math.abs(diffSeconds);
        const minutes = Math.floor(absDiff / 60);
        const seconds = Math.floor(absDiff % 60);
        const timeStr = `${sign}${String(minutes)}:${String(seconds).padStart(2, '0')}`;
        const displayEl = state.gameViewActive ? document.querySelector('#game-race-display #ghost-diff-display') : DOMElements.ghostDiffDisplay;
        if (displayEl) {
            displayEl.textContent = timeStr;
            displayEl.className = diffSeconds >= 0 ? 'text-2xl font-bold text-green-400' : 'text-2xl font-bold text-red-400';
        }
    },

    updatePower() {
        this.updateRaceInfo('#power-display', `${state.power} W`);
    },
    updateSpeed() {
        this.updateRaceInfo('#speed-display', `${state.speed.toFixed(1)} mph`);
    },
    updateDistance() {
        this.updateRaceInfo('#distance-display', `${state.distanceCovered.toFixed(2)} mi`);
    },
    updateGradient() {
        this.updateRaceInfo('#gradient-display', `${state.gradient.toFixed(1)} %`);
    },
    updateElapsedTime() {
        this.updateRaceInfo('#elapsed-time-display', this.formatTime(state.elapsedTime));
    },

    updateRaceInfo(selector, text) {
        const el = state.gameViewActive ? document.querySelector(`#game-race-display ${selector}`) : DOMElements[selector.slice(1)];
        if (el) el.textContent = text;
    },

    formatTime(totalSeconds) {
        const seconds = Math.floor(totalSeconds);
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    },

    startCountdown() {
        let count = 10;
        const update = () => {
            if (count > 0) {
                DOMElements.countdownTimer.textContent = `00:${String(count).padStart(2, '0')}`;
                count--;
            } else {
                clearInterval(state.countdownInterval);
                DOMElements.countdownTimer.textContent = "GO!";
                DOMElements.countdownSection.classList.replace('bg-gray-700', 'bg-green-600');
                setTimeout(() => {
                    DOMElements.countdownSection.classList.add('hidden');
                    state.raceStarted = true;
                    DOMElements.raceStatus.textContent = 'Race in Progress';
                }, 500);
            }
        };
        update();
        state.countdownInterval = setInterval(update, 1000);
    },

    drawCourseProfile() {
        const canvas = state.gameViewActive ? document.querySelector('#game-course-profile canvas') : DOMElements.courseProfileCanvas;
        const placeholder = state.gameViewActive ? document.querySelector('#game-course-profile #course-profile-placeholder') : DOMElements.courseProfilePlaceholder;

        if (!canvas) return; // Canvas not ready

        if (!state.gpxData || state.gpxData.length === 0) {
            if(placeholder) placeholder.classList.remove('hidden');
            return;
        }
        if(placeholder) placeholder.classList.add('hidden');

        if (state.gameViewActive) {
            this.drawGameViewProfile(canvas);
        } else {
            this.drawStaticProfile(canvas);
        }
    },

    drawStaticProfile(canvas) {
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const { width, height } = rect;
        const padding = 20;

        const elevations = state.gpxData.map(p => p.ele);
        const minEle = Math.min(...elevations);
        const eleRange = Math.max(...elevations) - minEle || 1;

        ctx.fillStyle = '#374151'; // bg-gray-700
        ctx.fillRect(0, 0, width, height);

        const getCoords = (p) => {
            const x = (p.startDistance / state.totalDistance) * width;
            const y = height - (((p.ele - minEle) / eleRange) * (height - padding * 2) + padding);
            return { x, y };
        };

        ctx.beginPath();
        ctx.moveTo(0, getCoords(state.gpxData[0]).y);
        for (let i = 1; i < state.gpxData.length; i++) {
            ctx.lineTo(getCoords(state.gpxData[i]).x, getCoords(state.gpxData[i]).y);
        }

        ctx.strokeStyle = '#FBBF24'; // amber-400
        ctx.lineWidth = 3;
        ctx.stroke();
    },

    drawGameViewProfile(canvas) {
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const { width, height } = rect;
        const padding = 20;

        const distBehind = GAME_VIEW_DISTANCE * (RIDER_POSITION_PERCENT / 100);
        const distAhead = GAME_VIEW_DISTANCE * (1 - RIDER_POSITION_PERCENT / 100);

        const windowStart = state.distanceCovered - distBehind;
        const windowEnd = state.distanceCovered + distAhead;

        const visiblePoints = state.gpxData.filter(p => p.startDistance >= windowStart - 0.1 && p.startDistance <= windowEnd + 0.1);
        if (visiblePoints.length < 2) return;

        const elevations = visiblePoints.map(p => p.ele);
        state.gameView.minEle = Math.min(...elevations);
        state.gameView.eleRange = Math.max(...elevations) - state.gameView.minEle || 1;

        ctx.fillStyle = '#111827'; // bg-gray-900
        ctx.fillRect(0, 0, width, height);

        const getGameCoords = (p) => {
            const x = ((p.startDistance - windowStart) / GAME_VIEW_DISTANCE) * width;
            const y = height - (((p.ele - state.gameView.minEle) / state.gameView.eleRange) * (height - padding * 2) + padding);
            return { x, y };
        };

        // Gradient fill
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, 'rgba(59, 130, 246, 0.5)'); // blue-500
        gradient.addColorStop(1, 'rgba(17, 24, 39, 0.1)'); // gray-900
        ctx.fillStyle = gradient;
        ctx.beginPath();
        const firstPoint = getGameCoords(visiblePoints[0]);
        ctx.moveTo(firstPoint.x, height);
        ctx.lineTo(firstPoint.x, firstPoint.y);
        for (let i = 1; i < visiblePoints.length; i++) {
            ctx.lineTo(getGameCoords(visiblePoints[i]).x, getGameCoords(visiblePoints[i]).y);
        }
        const lastPoint = getGameCoords(visiblePoints[visiblePoints.length - 1]);
        ctx.lineTo(lastPoint.x, height);
        ctx.closePath();
        ctx.fill();

        // Line stroke
        ctx.beginPath();
        ctx.moveTo(firstPoint.x, firstPoint.y);
        for (let i = 1; i < visiblePoints.length; i++) {
            ctx.lineTo(getGameCoords(visiblePoints[i]).x, getGameCoords(visiblePoints[i]).y);
        }
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 4;
        ctx.stroke();
    },

    updateRacerDots() {
        if (state.gameViewActive) {
            this._updateGameViewDot('rider', state.distanceCovered, '🚴');
            if (state.course && state.course.recordRun) {
                this._updateGameViewDot('ghost', state.ghostDistanceCovered, '👻');
            }
        } else {
            this._updateStaticDot('rider', state.distanceCovered, '🚴');
            if (state.course && state.course.recordRun) {
                this._updateStaticDot('ghost', state.ghostDistanceCovered, '👻');
            } else {
                 const ghostDot = document.getElementById('dot-ghost');
                 if (ghostDot) ghostDot.style.display = 'none';
            }
        }
    },

    _getDot(id, emoji, container) {
        let dot = document.getElementById(`dot-${id}`);
        if (!dot) {
            dot = document.createElement('div');
            dot.id = `dot-${id}`;
            dot.textContent = emoji;
            dot.className = 'absolute text-4xl';
            dot.style.transform = 'translate(-50%, -90%)';
            container.appendChild(dot);
        }
        return dot;
    },

    _updateStaticDot(id, distance, emoji) {
        const container = DOMElements.courseProfileContainer;
        if (!container || !state.gpxData || state.gpxData.length < 2) return;
        const dot = this._getDot(id, emoji, container);
        
        const elevations = state.gpxData.map(p => p.ele);
        const minEle = Math.min(...elevations);
        const eleRange = Math.max(...elevations) - minEle || 1;
        
        const point = PhysicsController.getPointAtDistance(distance);
        if (!point) return;

        const rect = container.querySelector('canvas').getBoundingClientRect();
        const padding = 20;
        const yPercent = 1 - ((point.ele - minEle) / eleRange);
        const topPx = yPercent * (rect.height - padding * 2) + padding;
        const leftPercent = (distance / state.totalDistance) * 100;

        dot.style.top = `${topPx}px`;
        dot.style.left = `${leftPercent}%`;
    },

    _updateGameViewDot(id, distance, emoji) {
        const container = document.getElementById('game-course-profile');
        if (!container || !state.gpxData || state.gpxData.length < 2) return;
        const dot = this._getDot(id, emoji, container);

        const distBehind = GAME_VIEW_DISTANCE * (RIDER_POSITION_PERCENT / 100);
        const windowStart = state.distanceCovered - distBehind;

        const leftPercent = ((distance - windowStart) / GAME_VIEW_DISTANCE) * 100;

        if (leftPercent < -10 || leftPercent > 110) { // Hide if far off-screen
            dot.style.display = 'none';
            return;
        }
        dot.style.display = 'block';

        const point = PhysicsController.getPointAtDistance(distance);
        if (!point) return;

        const rect = container.querySelector('canvas').getBoundingClientRect();
        const padding = 20;
        const yPercent = 1 - ((point.ele - state.gameView.minEle) / state.gameView.eleRange);
        const topPx = yPercent * (rect.height - padding * 2) + padding;

        dot.style.top = `${topPx}px`;
        dot.style.left = `${leftPercent}%`;
    }
};