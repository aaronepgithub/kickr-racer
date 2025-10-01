
import { state } from './state.js';
import { DOMElements } from './dom.js';
import { BluetoothController } from './bluetooth.js';
import { FirebaseController } from './firebase.js';
import { PhysicsController } from './physics.js';

export const UIController = {
    init() {
        // Set initial weight from the DOM
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

        // Listen for keyboard events for simulator
        document.addEventListener('keydown', (e) => {
            if (state.simulator.active) {
                if (e.key === 'ArrowUp') {
                    state.simulator.power += 10;
                } else if (e.key === 'ArrowDown') {
                    state.simulator.power = Math.max(0, state.simulator.power - 10);
                }
                this.updateSimPowerDisplay();
            }
        });


        this.loadCourses();
        this.updateStartRaceButtonState();
        this.drawCourseProfile(); // Draw initial empty state
    },
    toggleSimulator() {
        state.simulator.active = !state.simulator.active;

        if (state.simulator.active) {
            DOMElements.simulatorControls.classList.remove('hidden');
            DOMElements.bluetoothStatus.textContent = "Simulator Active";
            DOMElements.bluetoothStatus.classList.remove("text-red-400");
            DOMElements.bluetoothStatus.classList.add("text-purple-400");
            state.trainer.connected = true; // Pretend we are connected

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
            DOMElements.courseList.innerHTML = '<p>No courses found. Upload one to get started!</p>';
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

        // Data migration for older record runs that may not have distance in checkpoints
        if (state.course.recordRun && state.course.recordRun.checkpointTimes) {
            state.course.recordRun.checkpointTimes.forEach(cp => {
                if (cp.distance === undefined) {
                    // The old property was called 'mile' but represented a percentage
                    cp.distance = cp.mile * state.totalDistance;
                }
            });
        }

        // Highlight selected course
        Array.from(DOMElements.courseList.children).forEach(child => {
            child.classList.remove('bg-cyan-700');
        });
        const selectedEl = Array.from(DOMElements.courseList.children).find(child => child.textContent === course.name);
        if (selectedEl) {
            selectedEl.classList.add('bg-cyan-700');
        }

        this.drawCourseProfile();
        this.displayRecordTimes();
        this.updateStartRaceButtonState();
        DOMElements.raceStatus.textContent = `${course.name} selected.`;
    },


    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        DOMElements.gpxFileName.textContent = file.name;


        const reader = new FileReader();
        reader.onload = async (e) => {
            DOMElements.gpxFileName.textContent = "Parsing...";
            const result = PhysicsController.parseGPX(e.target.result, file.name);
            if (result) {
                DOMElements.gpxFileName.textContent = "Uploading...";
                const courseId = await FirebaseController.uploadCourse(result);
                if (courseId) {
                    DOMElements.gpxFileName.textContent = "Uploaded!";
                    await this.loadCourses();
                    const courses = await FirebaseController.getCourses();
                    const newCourse = courses.find(c => c.id === courseId);
                    if(newCourse) this.selectCourse(newCourse);
                } else {
                    DOMElements.gpxFileName.textContent = "Upload failed.";
                }

            } else {
                DOMElements.gpxFileName.textContent = "Invalid GPX file";
            }
        };
        reader.readAsText(file);
    },


    startRace() {
        DOMElements.preRaceSetup.classList.add('hidden');

        // Show the main race display if not in game view
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

        // Move the race elements to the game view
        const raceDisplay = DOMElements.raceDisplay;
        const courseProfile = DOMElements.courseProfileSection;

        // Clone and replace to avoid ID conflicts
        const gameRaceDisplay = raceDisplay.cloneNode(true);
        const gameCourseProfile = courseProfile.cloneNode(true);

        gameRaceDisplay.id = 'game-race-display';
        gameCourseProfile.id = 'game-course-profile';

        // Setup game view layout
        gameView.innerHTML = ''; // Clear previous content
        gameView.appendChild(gameCourseProfile);
        gameView.appendChild(gameRaceDisplay);

        // Style for game view
        gameCourseProfile.className = 'relative w-full h-full';
        const canvas = gameCourseProfile.querySelector('canvas');
        canvas.className = 'w-full h-full';

        gameRaceDisplay.className = 'absolute top-4 left-4 space-y-4';

        mainContent.classList.add('hidden');
        gameView.classList.remove('hidden');

        // Redraw the canvas in its new container
        this.drawCourseProfile(gameCourseProfile.querySelector('canvas'), gameCourseProfile.querySelector('#course-profile-placeholder'));
        this.updateRacerDots();

        // Try to go fullscreen
        if (gameView.requestFullscreen) {
            gameView.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
            });
        }
    },


    updateStartRaceButtonState() {
        const nameEntered = DOMElements.racerNameInput.value.trim() !== '';
        const weightEntered = DOMElements.racerWeightInput.value > 0;
        const courseSelected = state.course !== null;
        const trainerConnected = state.trainer.connected;
        DOMElements.startRaceBtn.disabled = !(nameEntered && weightEntered && courseSelected && trainerConnected);
    },

    displayRecordTimes() {
        if (state.course && state.course.recordRun) {
            const record = state.course.recordRun;
            DOMElements.recordHolderName.textContent = record.runnerName;
            const totalSeconds = Math.floor(record.totalTime);
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            DOMElements.recordHolderTime.textContent =
                `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        } else {
            DOMElements.recordHolderName.textContent = 'N/A';
            DOMElements.recordHolderTime.textContent = 'N/A';
        }
    },

    updateGhostDiff(diffSeconds) {
        // Positive is ahead (green), negative is behind (red).
        const sign = diffSeconds >= 0 ? '+' : '-';
        const absDiff = Math.abs(diffSeconds);
        const minutes = Math.floor(absDiff / 60);
        const seconds = Math.floor(absDiff % 60);
        const displayEl = state.gameViewActive ? document.querySelector('#game-race-display #ghost-diff-display') : DOMElements.ghostDiffDisplay;
        if(displayEl) {
            displayEl.textContent = `${sign}${String(minutes)}:${String(seconds).padStart(2, '0')}`;
            displayEl.className = diffSeconds >= 0 ? 'text-2xl font-bold text-green-400' : 'text-2xl font-bold text-red-400';
        }

    },

    displayNewRecordMessage(runnerName) {
        // This could be a more prominent modal in a future version
        DOMElements.raceStatus.textContent = `New Record by ${runnerName}!`;
        DOMElements.raceStatus.className = 'text-yellow-400 font-bold';
    },

    updatePower() {
         const displayEl = state.gameViewActive ? document.querySelector('#game-race-display #power-display') : DOMElements.powerDisplay;
         if(displayEl) displayEl.textContent = `${state.power} W`;
    },
    updateSpeed() {
        const displayEl = state.gameViewActive ? document.querySelector('#game-race-display #speed-display') : DOMElements.speedDisplay;
        if(displayEl) displayEl.textContent = `${state.speed.toFixed(1)} mph`;
    },
    updateDistance() {
        const displayEl = state.gameViewActive ? document.querySelector('#game-race-display #distance-display') : DOMElements.distanceDisplay;
        if(displayEl) displayEl.textContent = `${state.distanceCovered.toFixed(2)} mi`;
    },
    updateGradient() {
        const displayEl = state.gameViewActive ? document.querySelector('#game-race-display #gradient-display') : DOMElements.gradientDisplay;
        if(displayEl) displayEl.textContent = `${state.gradient.toFixed(1)} %`;
    },

    updateElapsedTime() {
        const totalSeconds = Math.floor(state.elapsedTime);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        const displayEl = state.gameViewActive ? document.querySelector('#game-race-display #elapsed-time-display') : DOMElements.elapsedTimeDisplay;
        if (displayEl) displayEl.textContent = timeString;

    },
    startCountdown() {

        let count = 10;
        DOMElements.countdownTimer.textContent = `00:${count}`;
        state.countdownInterval = setInterval(() => {
            count--;
            DOMElements.countdownTimer.textContent = `00:${String(count).padStart(2, '0')}`;
            if (count <= 0) {
                DOMElements.countdownTimer.textContent = "GO!";
                DOMElements.countdownSection.classList.add('bg-green-600');
                DOMElements.countdownSection.classList.remove('bg-gray-700');
                clearInterval(state.countdownInterval);
                state.raceStarted = true;
                DOMElements.raceStatus.textContent = 'Race in Progress';
            }
        }, 1000);
    },
    drawCourseProfile(canvas = DOMElements.courseProfileCanvas, placeholder = DOMElements.courseProfilePlaceholder) {
        const ctx = canvas.getContext('2d');

        if (!state.gpxData || state.gpxData.length === 0 || state.totalDistance === 0) {
            // No course selected, show placeholder
            placeholder.classList.remove('hidden');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        // Course is selected, hide placeholder and draw
        placeholder.classList.add('hidden');


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


        // Draw a solid background for the canvas
        ctx.fillStyle = '#374151'; // bg-gray-700
        ctx.fillRect(0, 0, width, height);


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

        gradient.addColorStop(0, 'rgba(250, 204, 21, 0.6)'); // Yellow-400 with 60% opacity
        gradient.addColorStop(1, 'rgba(250, 204, 21, 0.1)'); // Yellow-400 with 10% opacity

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

        ctx.strokeStyle = '#FFFFFF'; // White
        ctx.lineWidth = 4;
        ctx.stroke();
    },
    _updateDot(id, distanceCovered, className) {
        const container = state.gameViewActive ? document.getElementById('game-course-profile') : DOMElements.courseProfileContainer;
        const canvas = container.querySelector('canvas');
        if (!container || !canvas) return;

        if (!state.gpxData || state.gpxData.length < 2 || !state.totalDistance || state.totalDistance === 0) {
            const dot = document.getElementById(id);
            if (dot) dot.style.display = 'none';
            return;
        }

        let dot = document.getElementById(id);
        if (!dot) {
            dot = document.createElement('div');
            dot.id = id;
            dot.className = className;
            dot.style.transform = 'translateY(-50%)';
            container.appendChild(dot);
        }
        dot.style.display = 'block';

        const percentComplete = (distanceCovered / state.totalDistance);
        const currentPos = Math.min(state.totalDistance, Math.max(0, distanceCovered));

        let segmentIndex = state.gpxData.findIndex(p => currentPos >= p.startDistance && currentPos < (p.startDistance + p.distance));

        if (segmentIndex === -1) {
            // If not found, it's likely on the last point or beyond.
            segmentIndex = state.gpxData.length - 2;
        }

        if (segmentIndex < 0) return;

        const p1 = state.gpxData[segmentIndex];
        const p2 = state.gpxData[segmentIndex + 1];

        if (!p1 || !p2) return;

        const segmentDist = p2.startDistance - p1.startDistance;
        const distIntoSegment = currentPos - p1.startDistance;
        const percentIntoSegment = segmentDist > 0 ? distIntoSegment / segmentDist : 0;
        const interpolatedEle = p1.ele + (p2.ele - p1.ele) * percentIntoSegment;

        const elevations = state.gpxData.map(p => p.ele);
        const maxEle = Math.max(...elevations);
        const minEle = Math.min(...elevations);
        const eleRange = maxEle - minEle === 0 ? 1 : maxEle - minEle;
        const padding = 20;

        const rect = canvas.getBoundingClientRect();
        if (rect.height === 0) return;

        const yPercent = 1 - ((interpolatedEle - minEle) / eleRange);
        const topPx = yPercent * (rect.height - padding * 2) + padding;

        dot.style.top = `${topPx}px`;
        dot.style.left = `calc(${Math.min(100, percentComplete * 100)}% - 6px)`;
    },

    updateRacerDots() {
        this._updateDot(
            `dot-${state.userId}`,
            state.distanceCovered,
            'race-dot absolute w-3 h-3 rounded-full border-2 bg-cyan-400 border-white'
        );

        if (state.course && state.course.recordRun) {
            this._updateDot(
                'dot-ghost',
                state.ghostDistanceCovered,
                'race-dot absolute w-3 h-3 rounded-full border-2 bg-yellow-400 border-white opacity-70'
            );
        } else {
            const ghostDot = document.getElementById('dot-ghost');
            if (ghostDot) ghostDot.style.display = 'none';
        }
    }
};