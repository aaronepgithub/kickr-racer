export const firebaseConfig = {
    apiKey: "AIzaSyCY-RqfO0XUcRkZ7OBLDtMm-e-jVJyLrQ0",
    authDomain: "kickr-racer.firebaseapp.com",
    projectId: "kickr-racer",
    storageBucket: "kickr-racer.appspot.com",
    messagingSenderId: "433608140491",
    appId: "1:433608140491:web:d5d736f7d6cfdeaf7edd4e"
};

export const appId = 'default-app-id';

export const villains = {
    rouleur: {
        name: 'Rouleur',
        duration: 30, // seconds
        cooldown: 30, // seconds
        powerBoost: 50, // watts
        minAppearanceTime: 30, // seconds into the race
        emoji: '😈'
    },
    climber: {
        name: 'Climber',
        duration: 20,
        powerBoost: 75,
        emoji: '🧗'
    },
    sprinter: {
        name: 'Sprinter',
        duration: 10,
        powerBoost: 100,
        emoji: '⚡'
    }
};
