export const state = {
    userId: null,
    raceId: null,
    gpxData: null,
    racers: {},
    totalDistance: 0, // In miles
    distanceCovered: 0, // In miles
    speed: 0, // In mph
    power: 0, // In watts
    gradient: 0,
    riderWeightLbs: 165,
    raceStartTime: null, // Timestamp
    raceStarted: false,
    countdownInterval: null,
    trainer: {
        device: null,
        controlCharacteristic: null,
        dataCharacteristic: null,
        connected: false,
        powerOffset: 2, // configurable offset to read instantaneous power (default 2)
    },
    raceUnsubscribe: null,
    raceDocUnsubscribe: null,
    lastFirebaseUpdateTime: 0,
    lastFirebaseUpdateDistance: 0,
    firebaseQuotaMet: false,
};
