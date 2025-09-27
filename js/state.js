export const state = {
    userId: null,

    racerName: '',

    // Course data
    course: null, // The full selected course object from Firebase
    gpxData: null, // The route data for the current course
    totalDistance: 0,

    // Live race data
    distanceCovered: 0,
    speed: 0,
    power: 0,
    gradient: 0,
    elapsedTime: 0,
    riderWeightLbs: 0,

    // Race state
    raceStarted: false,
    countdownInterval: null,

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
};

