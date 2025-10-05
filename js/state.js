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
    gradient: 0, // The current, smoothed gradient
    targetGradient: 0, // The actual gradient from the course data
    lastSentAverageGradient: 0, // The last average gradient value sent to the trainer
    lastGradientUpdateTime: 0,
    gradientSamples: [], // Samples for averaging gradient
    elapsedTime: 0,
    riderWeightLbs: 175,

    // Race state
    raceStarted: false,
    raceFinished: false, // True when both rider and ghost are done
    riderFinished: false,
    ghostFinished: false,
    gameViewActive: false,
    countdownInterval: null,

    // Game view specific state
    gameView: {
        minEle: 0,
        eleRange: 1
    },

    // Ghost data for comparison
    ghostDistanceCovered: 0,

    // Checkpoint tracking for the current run
    checkpointTimes: [],
    nextCheckpointIndex: 0,

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

    // Villain state
    villain: {
        active: false,
        power: 0,
        distanceCovered: 0,
        appearanceTime: 0,
        timeSinceLastVillian: 0,
        nextAppearanceTime: 120, // Time for the next villain to appear
    },
};
