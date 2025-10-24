import { state } from './state.js';
import { BluetoothController } from './bluetooth.js';
import { FirebaseController } from './firebase.js';
import { PhysicsController } from './physics.js';

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// --- CONSTANTS FOR GAME VIEW ---
const GAME_VIEW_DISTANCE = 0.25; // miles
const RIDER_POSITION_PERCENT = 20; // Rider is 20% from the left edge

export const UIController = {
    init() {
        state.riderWeightLbs = parseInt(document.getElementById('racer-weight-input').value, 10);

        // Set up background music
        state.music = new Audio('/assets/music/tropical_fantasy.mp3');
        state.music.loop = true;

        document.getElementById('connect-btn').addEventListener('click', () => BluetoothController.connect());
        document.getElementById('connect-power-meter-btn').addEventListener('click', () => BluetoothController.connectPowerMeter());
        document.getElementById('simulator-btn').addEventListener('click', () => this.toggleSimulator());
        document.getElementById('fullscreen-btn').addEventListener('click', () => this.enterGameView());
        document.getElementById('gpx-upload').addEventListener('change', (event) => this.handleFileUpload(event));
        document.getElementById('racer-name-input').addEventListener('input', () => this.updateStartRaceButtonState());
        document.getElementById('racer-weight-input').addEventListener('input', (e) => {
            state.riderWeightLbs = parseInt(e.target.value, 10);
            this.updateStartRaceButtonState();
        });
        document.getElementById('start-race-btn').addEventListener('click', () => this.startRace());

        document.getElementById('erg-mode-toggle').addEventListener('change', (e) => {
            state.ergMode.active = e.target.checked;
            this.updateErgModeUI();
        });
        document.getElementById('erg-watts-input').addEventListener('input', (e) => {
            state.ergMode.zone2Watts = parseInt(e.target.value, 10);
        });

        // Power slider has been replaced with cadence and gear sliders

        document.getElementById('simulator-cadence-slider').addEventListener('input', (e) => {
            if (state.simulator.active) {
                state.simulator.cadence = parseInt(e.target.value, 10);
                document.getElementById('sim-cadence-display').textContent = `${state.simulator.cadence} RPM`;
                this.calculateSimulatorPower();
            }
        });

        document.getElementById('simulator-gear-slider').addEventListener('input', (e) => {
            if (state.simulator.active) {
                state.simulator.gear = parseInt(e.target.value, 10);
                document.getElementById('sim-gear-display').textContent = `Gear ${state.simulator.gear}`;
                this.calculateSimulatorPower();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (state.simulator.active) {
                if (e.key === 'ArrowUp') {
                    state.simulator.cadence = Math.min(95, state.simulator.cadence + 1);
                    document.getElementById('simulator-cadence-slider').value = state.simulator.cadence;
                    document.getElementById('sim-cadence-display').textContent = `${state.simulator.cadence} RPM`;
                }
                else if (e.key === 'ArrowDown') {
                    state.simulator.cadence = Math.max(85, state.simulator.cadence - 1);
                    document.getElementById('simulator-cadence-slider').value = state.simulator.cadence;
                    document.getElementById('sim-cadence-display').textContent = `${state.simulator.cadence} RPM`;
                }
                else if (e.key === 'ArrowRight') {
                    state.simulator.gear = Math.min(12, state.simulator.gear + 1);
                    document.getElementById('simulator-gear-slider').value = state.simulator.gear;
                    document.getElementById('sim-gear-display').textContent = `Gear ${state.simulator.gear}`;
                }
                else if (e.key === 'ArrowLeft') {
                    state.simulator.gear = Math.max(1, state.simulator.gear - 1);
                    document.getElementById('simulator-gear-slider').value = state.simulator.gear;
                    document.getElementById('sim-gear-display').textContent = `Gear ${state.simulator.gear}`;
                }
                this.calculateSimulatorPower();
            }
        });

        this.loadCourses();
        this.updateStartRaceButtonState();
        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement && state.simulator.active) {
                document.body.appendChild(document.getElementById('simulator-controls'));
                document.body.appendChild(document.getElementById('simulator-power-slider-container'));
            }
        });
    },

    toggleSimulator() {
        state.simulator.active = !state.simulator.active;
        state.trainer.connected = state.simulator.active;

        if (state.simulator.active) {
            state.ergMode.active = false;
            document.getElementById('erg-mode-toggle').checked = false;
            this.updateErgModeUI();
        }

        this.updateTrainerConnectionUI(state.trainer.connected);
        this.updateStartRaceButtonState();
    },

    updateTrainerConnectionUI(connected) {
        const simulatorControls = document.getElementById('simulator-controls');
        const simulatorSlider = document.getElementById('simulator-power-slider-container');
        const bluetoothStatus = document.getElementById('bluetooth-status');
        const connectBtn = document.getElementById('connect-btn');
        const simulatorBtn = document.getElementById('simulator-btn');
        const ergModeSection = document.getElementById('erg-mode-section');

        if (connected) {
            if (state.simulator.active) {
                simulatorControls.classList.remove('hidden');
                bluetoothStatus.textContent = "Simulator Active";
                bluetoothStatus.classList.add("text-purple-400");
                bluetoothStatus.classList.remove("text-red-400");
                connectBtn.classList.add('hidden');
                simulatorBtn.textContent = "Disable Simulator";
                ergModeSection.classList.add('hidden');
                this.updateSimulatorUI();
            } else {
                bluetoothStatus.textContent = 'Connected';
                bluetoothStatus.classList.add('text-green-400');
                bluetoothStatus.classList.remove('text-red-400');
                connectBtn.textContent = 'Connected';
                connectBtn.disabled = true;
                simulatorBtn.classList.add('hidden');
                ergModeSection.classList.remove('hidden');
            }
        } else {
            simulatorControls.classList.add('hidden');
            simulatorSlider.classList.add('hidden');
            bluetoothStatus.textContent = "Disconnected";
            bluetoothStatus.classList.add("text-red-400");
            bluetoothStatus.classList.remove("text-purple-400");
            connectBtn.classList.remove('hidden');
            connectBtn.disabled = false;
            connectBtn.textContent = 'Connect';
            simulatorBtn.textContent = "Finger Power";
            simulatorBtn.classList.remove('hidden');
            ergModeSection.classList.add('hidden');
        }
    },

    updatePowerMeterConnectionUI(connected) {
        const powerMeterStatus = document.getElementById('power-meter-status');
        const connectPowerMeterBtn = document.getElementById('connect-power-meter-btn');

        if (connected) {
            powerMeterStatus.textContent = 'Connected';
            powerMeterStatus.classList.add('text-green-400');
            powerMeterStatus.classList.remove('text-red-400');
            connectPowerMeterBtn.textContent = 'Connected';
            connectPowerMeterBtn.disabled = true;
        } else {
            powerMeterStatus.textContent = 'Disconnected';
            powerMeterStatus.classList.add('text-red-400');
            powerMeterStatus.classList.remove('text-green-400');
            connectPowerMeterBtn.disabled = false;
            connectPowerMeterBtn.textContent = 'Connect';
        }
    },

    updatePowerMeterConnectionUI(connected) {
        const powerMeterStatus = document.getElementById('power-meter-status');
        const connectPowerMeterBtn = document.getElementById('connect-power-meter-btn');
        const connectBtn = document.getElementById('connect-btn');
        const simulatorBtn = document.getElementById('simulator-btn');

        if (connected) {
            powerMeterStatus.textContent = 'Connected';
            powerMeterStatus.classList.add('text-green-400');
            powerMeterStatus.classList.remove('text-red-400');
            connectPowerMeterBtn.textContent = 'Connected';
            connectPowerMeterBtn.disabled = true;
            connectBtn.classList.add('hidden');
            simulatorBtn.classList.add('hidden');
        } else {
            powerMeterStatus.textContent = 'Disconnected';
            powerMeterStatus.classList.add('text-red-400');
            powerMeterStatus.classList.remove('text-green-400');
            connectPowerMeterBtn.disabled = false;
            connectPowerMeterBtn.textContent = 'Connect';
            connectBtn.classList.remove('hidden');
            simulatorBtn.classList.remove('hidden');
        }
    },

    calculateSimulatorPower() {
        // Gear 1 has highest resistance, Gear 12 has lowest
        // To achieve 30mph on flat road (0% gradient) at 100rpm in gear 1:
        // Base power calculation
        const maxPower = 600; // Power needed for 30mph in hardest gear at 100rpm
        const gearFactor = (13 - state.simulator.gear) / 12; // 1.0 (gear1) down to ~0.08 (gear12)
        const cadenceFactor = state.simulator.cadence / 100; // normalized to 100 RPM

        state.simulator.power = Math.round(maxPower * gearFactor * cadenceFactor);

        document.getElementById('sim-power-display').textContent = `${state.simulator.power} W`;
    },

    updateSimulatorUI() {
        document.getElementById('sim-power-display').textContent = `${state.simulator.power} W`;
        document.getElementById('simulator-cadence-slider').value = state.simulator.cadence;
        document.getElementById('sim-cadence-display').textContent = `${state.simulator.cadence} RPM`;
        document.getElementById('simulator-gear-slider').value = state.simulator.gear;
        document.getElementById('sim-gear-display').textContent = `Gear ${state.simulator.gear}`;
    },

    updateErgModeUI() {
        const wattsInputContainer = document.getElementById('erg-watts-input-container');
        if (state.ergMode.active) {
            wattsInputContainer.classList.remove('hidden');
        } else {
            wattsInputContainer.classList.add('hidden');
        }
    },

    async loadCourses() {
        const courseList = document.getElementById('course-list');
        courseList.innerHTML = '<p>Loading courses...</p>';
        const courses = await FirebaseController.getCourses();
        courseList.innerHTML = '';
        if (courses.length === 0) {
            courseList.innerHTML = '<p>No courses found.</p>';
            return;
        }
        courses.forEach(course => {
            const courseEl = document.createElement('div');
            courseEl.className = 'p-3 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-700';
            courseEl.textContent = course.name;
            courseEl.addEventListener('click', () => this.selectCourse(course));
            courseList.appendChild(courseEl);
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
        const courseList = document.getElementById('course-list');
        Array.from(courseList.children).forEach(c => c.classList.remove('bg-cyan-700'));
        const selectedEl = Array.from(courseList.children).find(c => c.textContent === course.name);
        if (selectedEl) selectedEl.classList.add('bg-cyan-700');

        this.drawCourseProfile();
        this.displayCourseRecords();
        this.updateStartRaceButtonState();
        document.getElementById('race-status').textContent = `${course.name} selected.`;
    },

    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        const gpxFileName = document.getElementById('gpx-file-name');
        gpxFileName.textContent = `Parsing ${file.name}...`;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const result = PhysicsController.parseGPX(e.target.result, file.name);
            if (!result) {
                gpxFileName.textContent = "Invalid GPX file";
                return;
            }
            gpxFileName.textContent = "Uploading...";
            const courseId = await FirebaseController.uploadCourse(result);
            if (courseId) {
                gpxFileName.textContent = "Uploaded!";
                await this.loadCourses();
                const courses = await FirebaseController.getCourses();
                const newCourse = courses.find(c => c.id === courseId);
                if (newCourse) this.selectCourse(newCourse);
            } else {
                gpxFileName.textContent = "Upload failed.";
            }
        };
        reader.readAsText(file);
    },

    startRace() {
        if (!state.simulator.active) {
            BluetoothController.reset();
        }
        document.getElementById('pre-race-setup').classList.add('hidden');
        if (!state.gameViewActive) {
            document.getElementById('race-display').classList.remove('hidden');
        }
        document.getElementById('countdown-section').classList.remove('hidden');
        document.getElementById('fullscreen-btn').classList.remove('hidden');
        this.startCountdown();
    },

    enterGameView() {
        state.gameViewActive = true;
        const gameView = document.getElementById('game-view');
        const mainContent = document.getElementById('main-content');

        // Create course profile for game view
        const courseProfile = document.createElement('div');
        courseProfile.id = 'game-course-profile';
        courseProfile.className = 'relative w-full h-full';
        const canvas = document.createElement('canvas');
        canvas.className = 'w-full h-full';
        courseProfile.appendChild(canvas);

        // Create race display for game view
        const raceDisplayClone = document.getElementById('race-display').cloneNode(true);
        raceDisplayClone.id = 'game-race-display';
        raceDisplayClone.className = 'absolute top-4 left-4 right-4 grid grid-cols-2 md:grid-cols-5 gap-4 bg-gray-900 bg-opacity-70 p-4 rounded-lg';
        
        // Clean up and append
        gameView.innerHTML = '';
        gameView.appendChild(courseProfile);
        gameView.appendChild(raceDisplayClone);

        if (state.simulator.active) {
            gameView.appendChild(document.getElementById('simulator-controls'));
            gameView.appendChild(document.getElementById('simulator-power-slider-container'));
        }

        mainContent.classList.add('hidden');
        gameView.classList.remove('hidden');
        
        if (gameView.requestFullscreen) {
            gameView.requestFullscreen().catch(err => console.error(`Fullscreen error: ${err.message}`));
        }
    },

    updateStartRaceButtonState() {
        const canStart = document.getElementById('racer-name-input').value.trim() !== '' &&
                         document.getElementById('racer-weight-input').value > 0 &&
                         state.course !== null &&
                         (state.trainer.connected || state.powerMeter.connected);
        document.getElementById('start-race-btn').disabled = !canStart;
    },

    displayCourseRecords() {
        const record = state.course ? state.course.recordRun : null;
        const recordHolderName = document.getElementById('record-holder-name');
        const recordHolderTime = document.getElementById('record-holder-time');
        if (record) {
            recordHolderName.textContent = record.runnerName;
            recordHolderTime.textContent = this.formatTime(record.totalTime);
        } else {
            recordHolderName.textContent = 'N/A';
            recordHolderTime.textContent = 'N/A';
        }

        const highScore = state.course ? state.course.highScore : null;
        const highScoreHolderName = document.getElementById('high-score-holder-name');
        const highScorePoints = document.getElementById('high-score-points');
        if (highScore) {
            highScoreHolderName.textContent = highScore.name;
            highScorePoints.textContent = Math.floor(highScore.points);
        } else {
            highScoreHolderName.textContent = 'N/A';
            highScorePoints.textContent = 'N/A';
        }
    },

    updateGhostDistance() {
        const MILE_TO_KM = 1.60934;
        const distDiffMiles = state.ghostDistanceCovered - state.distanceCovered;
        const distDiffKm = Math.abs(distDiffMiles * MILE_TO_KM);

        const distStr = `${distDiffKm.toFixed(2)} km`;

        const displayEl = state.gameViewActive ? document.querySelector('#game-race-display #ghost-diff-display') : document.getElementById('ghost-diff-display');
        if (displayEl) {
            displayEl.textContent = distStr;
            // If distDiffMiles is negative, the rider is ahead of the ghost.
            displayEl.className = distDiffMiles <= 0 ? 'text-2xl font-bold text-green-400' : 'text-2xl font-bold text-red-400';
        }
    },

    updateVillainDisplay() {
        const villainDisplay = state.gameViewActive ? document.querySelector('#game-race-display #villain-display') : document.getElementById('villain-display');
        if (!villainDisplay) return;

        if (state.villain.active) {
            villainDisplay.classList.remove('hidden');

            if (state.villain.drafting) {
                villainDisplay.classList.remove('border-red-500');
                villainDisplay.classList.add('border-green-500');
            } else {
                villainDisplay.classList.remove('border-green-500');
                villainDisplay.classList.add('border-red-500');
            }

            const nameEl = state.gameViewActive ? villainDisplay.querySelector('#villain-name-display') : document.getElementById('villain-name-display');
            const powerEl = state.gameViewActive ? villainDisplay.querySelector('#villain-power-display') : document.getElementById('villain-power-display');
            const timeEl = state.gameViewActive ? villainDisplay.querySelector('#villain-time-display') : document.getElementById('villain-time-display');
            const distEl = state.gameViewActive ? villainDisplay.querySelector('#villain-dist-display') : document.getElementById('villain-dist-display');

            if (nameEl) nameEl.textContent = state.villain.name;
            if (powerEl) powerEl.textContent = `${state.villain.power} W`;
            if (timeEl) timeEl.textContent = `${Math.ceil(state.villain.timeRemaining)}s`;
            if (distEl) {
                const dist = state.villain.distanceToPlayer;
                const sign = dist > 0 ? '+' : '';
                distEl.textContent = `${sign}${dist.toFixed(1)}m`;
            }
        } else {
            villainDisplay.classList.add('hidden');
        }
    },


    showShiftWindow(gear) {
        this.updateRaceStatus(`Shift to Gear ${gear}!`);
    },

    showShiftSuccess() {
        this.updateRaceStatus('Perfect shift! +20');
    },

    showShiftMiss() {
        this.updateRaceStatus('Missed shift: -10% power for 5s');
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

    updatePoints() {
        this.updateRaceInfo('#points-display', Math.floor(state.points));
    },

    updateCadence() {
        const value = state.simulator.active ? `${state.simulator.cadence} rpm` : `N/A`;
        this.updateRaceInfo('#cadence-display', value);
    },

    updateRaceStatus(message) {
        this.updateRaceInfo('#race-status', message);
    },

    updateRaceInfo(selector, text) {
        const el = state.gameViewActive ? document.querySelector(`#game-race-display ${selector}`) : document.querySelector(selector);
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
        let count = 3;
        const countdownTimer = document.getElementById('countdown-timer');
        const countdownSection = document.getElementById('countdown-section');
        const update = () => {
            if (count > 0) {
                countdownTimer.textContent = `00:${String(count).padStart(2, '0')}`;
                count--;
            } else {
                clearInterval(state.countdownInterval);
                countdownTimer.textContent = "GO!";
                countdownSection.classList.replace('bg-gray-700', 'bg-green-600');
                setTimeout(() => {
                    countdownSection.classList.add('hidden');
                    state.raceStarted = true;
                    state.music.play();
                    state.villain.timeUntilNext = getRandomInt(15, 30);
                    document.getElementById('race-status').textContent = 'Race in Progress';
                    if (state.simulator.active) {
                        document.getElementById('simulator-power-slider-container').classList.remove('hidden');
                    }
                }, 500);
            }
        };
        update();
        state.countdownInterval = setInterval(update, 1000);
    },

    drawCourseProfile() {
        const canvas = state.gameViewActive ? document.querySelector('#game-course-profile canvas') : document.getElementById('course-profile-canvas');
        const placeholder = state.gameViewActive ? null : document.getElementById('course-profile-placeholder');

        if (!canvas) return; 

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
        const eleRange = (Math.max(...elevations) - minEle || 1) * 2;

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
        state.gameView.eleRange = (Math.max(...elevations) - state.gameView.minEle || 1) * 2;

        ctx.clearRect(0, 0, width, height);

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

        if (state.villain.active) {
            if (state.gameViewActive) {
                this._updateGameViewDot('villain', state.villain.distanceCovered, state.villain.emoji);
            } else {
                this._updateStaticDot('villain', state.villain.distanceCovered, state.villain.emoji);
            }
        } else {
            const villainDot = document.getElementById('dot-villain');
            if (villainDot) villainDot.style.display = 'none';
        }
    },

    _getDot(id, emoji, container) {
        let dot = document.getElementById(`dot-${id}`);
        if (!dot) {
            dot = document.createElement('div');
            dot.id = `dot-${id}`;
            if (id === 'rider') {
                dot.className = 'absolute text-6xl';
            } else {
                dot.className = 'absolute text-8xl';
            }

            let transform = 'translate(-50%, -90%)';
            if (id !== 'ghost') {
                transform += ' scaleX(-1)';
            }
            dot.style.transform = transform;

            if (id === 'rider') {
                dot.style.zIndex = '20';
            } else {
                dot.style.zIndex = '10';
            }
            container.appendChild(dot);
        } else if (dot.parentElement !== container) { // Ensure dot is in the correct container
            container.appendChild(dot);
        }
        dot.textContent = emoji; // Always update the emoji
        return dot;
    },

    _updateStaticDot(id, distance, emoji) {
        const container = document.getElementById('course-profile-container');
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
        
        let topPx = yPercent * (rect.height - padding * 2) + padding;
        topPx = Math.max(padding, Math.min(rect.height - padding, topPx));

        dot.style.top = `${topPx}px`;
        dot.style.left = `${leftPercent}%`;
    }
};