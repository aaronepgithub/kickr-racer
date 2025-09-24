import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, collection, addDoc, getDoc, updateDoc, serverTimestamp, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { firebaseConfig, appId } from './config.js';
import { state } from './state.js';
import { DOMElements } from './dom.js';
import { UIController } from './ui.js';

export const FirebaseController = {
    db: null,
    auth: null,
    init() {
        try {
            const app = initializeApp(firebaseConfig);
            this.db = getFirestore(app);
            this.auth = getAuth(app);
            setLogLevel('debug');
            this.authenticate();
        } catch (error) {
            console.error("Firebase initialization failed:", error);
            DOMElements.raceStatus.textContent = "Firebase Error";
            DOMElements.raceStatus.className = "text-red-500 font-bold";
        }
    },
    authenticate() {
        onAuthStateChanged(this.auth, async (user) => {
            if (user) {
                state.userId = user.uid;
                DOMElements.userIdDisplay.textContent = state.userId;
                console.log("Authenticated with user ID:", state.userId);

                // Check if joining an existing race from URL
                const urlParams = new URLSearchParams(window.location.search);
                const raceIdFromUrl = urlParams.get('raceId');
                if (raceIdFromUrl) {
                    this.joinRace(raceIdFromUrl);
                }

            } else {
               try {
                   await signInAnonymously(this.auth);
                   console.log("Signed in anonymously.");
               } catch (error) {
                   console.error("Anonymous sign-in failed:", error);
               }
            }
        });
    },
    async createRace() {
        if (!this.db || !state.gpxData) return;
        try {
            const startTime = new Date(Date.now() + 5 * 1000); // Default 1 minute from now
            const docRef = await addDoc(collection(this.db, `artifacts/${appId}/public/data/races`), {
                gpx: JSON.stringify(state.gpxData),
                createdAt: serverTimestamp(),
                totalDistance: state.totalDistance,
                creatorId: state.userId,
                startTime: startTime,
            });
            state.raceId = docRef.id;
            this.joinRace(state.raceId);
            UIController.showShareLink(state.raceId);
        } catch (e) {
            console.error("Error creating race: ", e);
        }
    },
    async joinRace(raceId) {
        if (!this.db || !state.userId) return;
        state.raceId = raceId;

        const raceDocRef = doc(this.db, `artifacts/${appId}/public/data/races`, raceId);

        // Listen for changes to the main race document (like startTime)
        if (state.raceDocUnsubscribe) state.raceDocUnsubscribe();
        state.raceDocUnsubscribe = onSnapshot(raceDocRef, (docSnap) => {
             if (docSnap.exists()) {
                const raceData = docSnap.data();

                if (!state.gpxData) { // Only load GPX once
                   state.gpxData = JSON.parse(raceData.gpx);
                   state.totalDistance = raceData.totalDistance;
                   UIController.updateTotalDistance();
                   UIController.drawCourseProfile();
                }

                state.raceStartTime = raceData.startTime.toDate();
                UIController.startCountdown();

                DOMElements.raceStatus.textContent = 'Race Joined';
                DOMElements.raceStatus.className = 'text-green-400';
                DOMElements.preRaceControls.classList.add('hidden');

                if (raceData.creatorId === state.userId) {
                    DOMElements.startTimerControls.classList.remove('hidden');
                }

                // Add self to the racers subcollection so others can see you
                this.updatePlayerState();
                // Listen for other racers
                this.listenForRacers();

            } else {
                console.error("Race not found!");
                DOMElements.raceStatus.textContent = "Race Not Found";
                DOMElements.raceStatus.className = "text-red-500";
            }
        });
    },
    async updateRaceStartTime(minutes) {
        if (!this.db || !state.raceId) return;
        const newStartTime = new Date(Date.now() + minutes * 60 * 1000);
        const raceDocRef = doc(this.db, `artifacts/${appId}/public/data/races`, state.raceId);
        await updateDoc(raceDocRef, { startTime: newStartTime });
    },
    updatePlayerState(force = false) {
        if (!this.db || !state.userId || !state.raceId || state.firebaseQuotaMet) return;

        const now = Date.now();
        const timeSinceLastUpdate = now - state.lastFirebaseUpdateTime;
        const distanceSinceLastUpdate = state.distanceCovered - state.lastFirebaseUpdateDistance;
        const isFinished = state.distanceCovered >= state.totalDistance;

        // Update conditions:
        // 1. Forced update (e.g., at the end of the race).
        // 2. More than 60 seconds have passed.
        // 3. More than 1 mile has been covered.
        // 4. The player has just finished the race.
        if (force || timeSinceLastUpdate > 60000 || distanceSinceLastUpdate >= 1 || isFinished) {
            const racerDocRef = doc(this.db, `artifacts/${appId}/public/data/races`, state.raceId, "racers", state.userId);
            const data = {
                id: state.userId,
                distance: state.distanceCovered,
                speed: state.speed,
                lastUpdate: serverTimestamp(),
                finished: isFinished,
            };

            setDoc(racerDocRef, data, { merge: true })
                .then(() => {
                    state.lastFirebaseUpdateTime = now;
                    state.lastFirebaseUpdateDistance = state.distanceCovered;
                    console.log("Player state updated to Firebase.");
                })
                .catch(error => {
                    console.error("Error updating player state:", error);
                    // Basic check for quota error. In a real app, you'd check error.code.
                    if (error.message.includes("RESOURCE_EXHAUSTED") || error.message.includes("quota")) {
                        console.warn("Firebase quota likely met. Disabling further updates.");
                        state.firebaseQuotaMet = true;
                        DOMElements.raceStatus.textContent = "Local Mode (Firebase Quota Met)";
                        DOMElements.raceStatus.className = "text-yellow-400";
                    }
                });
        }
    },
    listenForRacers() {
        if (state.raceUnsubscribe) state.raceUnsubscribe(); // Unsubscribe from previous listener
        const racersColRef = collection(this.db, `artifacts/${appId}/public/data/races`, state.raceId, "racers");
        state.raceUnsubscribe = onSnapshot(racersColRef, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                const racerData = change.doc.data();
                state.racers[racerData.id] = racerData;
            });
            UIController.updateLeaderboard();
            UIController.updateRacerDots();
        });
    }
};
