export const DOMElements = {
    connectBtn: document.getElementById('connect-btn'),
    simulatorBtn: document.getElementById('simulator-btn'),
    fullscreenBtn: document.getElementById('fullscreen-btn'),

    mainContent: document.getElementById('main-content'),
    gameView: document.getElementById('game-view'),

    bluetoothStatus: document.getElementById('bluetooth-status').querySelector('p:last-child'),
    raceStatus: document.getElementById('race-status').querySelector('p:last-child'),

    // Pre-Race
    preRaceSetup: document.getElementById('pre-race-setup'),
    racerNameInput: document.getElementById('racer-name-input'),
    racerWeightInput: document.getElementById('racer-weight-input'),
    courseList: document.getElementById('course-list'),
    gpxUpload: document.getElementById('gpx-upload'),
    gpxFileName: document.getElementById('gpx-file-name'),
    uploadCourseBtn: document.getElementById('upload-course-btn'),
    startRaceBtn: document.getElementById('start-race-btn'),

    // Simulator
    simulatorControls: document.getElementById('simulator-controls'),
    simPowerDisplay: document.getElementById('sim-power-display'),

    // Countdown
    countdownSection: document.getElementById('countdown-section'),
    countdownTimer: document.getElementById('countdown-timer'),

    // Race Display
    raceDisplay: document.getElementById('race-display'),

    powerDisplay: document.getElementById('power-display'),
    speedDisplay: document.getElementById('speed-display'),
    distanceDisplay: document.getElementById('distance-display'),
    gradientDisplay: document.getElementById('gradient-display'),

    elapsedTimeDisplay: document.getElementById('elapsed-time-display'),
    ghostDiffDisplay: document.getElementById('ghost-diff-display'),

    // Course Profile
    courseProfileSection: document.getElementById('course-profile-section'),
    courseProfileContainer: document.getElementById('course-profile-container'),
    courseProfileCanvas: document.getElementById('course-profile-canvas'),
    courseProfilePlaceholder: document.getElementById('course-profile-placeholder'),

    // Record Times
    recordTimesDisplay: document.getElementById('record-times-display'),
    recordHolderName: document.getElementById('record-holder-name'),
    recordHolderTime: document.getElementById('record-holder-time'),
};