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
    riderWeightLbs: 165, // Add back with a default value

    // Race state
    raceStarted: false,
    countdownInterval: null,

    // Checkpoint tracking for the current run
    checkpointTimes: [],
    nextCheckpointIndex: 0,

    // Trainer connection
    trainer: {
        device: null,
        controlCharacteristic: null,
        dataCharacteristic: null,
        connected: false,
    },
};