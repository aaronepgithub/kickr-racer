export const state = {
    userId: `rider-${Date.now()}`,

    racerName: '',

    // Course data
    course: null, // The full selected course object from Firebase
    gpxData: null, // The parsed route data for the current course
    totalDistance: 0,

    // Live race data
    distanceCovered: 0,
    speed: 0,
    power: 0,
    gradient: 0,
    elapsedTime: 0,
    riderWeightLbs: 175,

    // Race state
    raceStarted: false,
    raceFinished: false,
    gameViewActive: false,
    countdownInterval: null,

    // Game view specific state
    gameView: {
        minEle: 0,
        eleRange: 1
    },

    // Ghost data for comparison
    ghostDistanceCovered: 0,
    ghostFinished: false,
    ghostFinishTime: null,


    // Checkpoint tracking for the current run
    checkpointTimes: [],
    nextCheckpointIndex: 0,

    // Gradient smoothing
    lastGradientUpdateTime: 0,
    gradientBuffer: [],

    // Trainer connection
    trainer: {
        device: null,
        controlCharacteristic: null,
        dataCharacteristic: null,
        connected: false,
        isSettingGradient: false,
    },

    // Simulator mode
    simulator: {
        active: false,
        power: 100, // starting power
    },
};
