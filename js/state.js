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
    points: 0,

    // Race state
    raceStarted: false,
    raceFinished: false, // True when both rider and ghost are done
    music: null,
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
        isSettingErg: false,
    },

    // Power meter connection
    powerMeter: {
        device: null,
        powerCharacteristic: null,
        connected: false,
    },

    // Simulator mode
    simulator: {
        active: false,
        power: 100, // starting power
    },

    // ERG mode
    ergMode: {
        active: false,
        zone2Watts: 150,
        targetWatts: 0,
        lastSentErgWatts: 0,
        lastErgUpdateTime: 0,
    },

    // Villain state
    villain: {
        active: false,
        name: null,
        power: 0,
        powerBoost: 0,
        emoji: null,
        originalEmoji: null,
        distanceToPlayer: 0, // in meters
        distanceCovered: 0,
        timeRemaining: 0,
        timeUntilNext: 30, // Initial delay before first villain can appear
        drafting: false
    }
};
