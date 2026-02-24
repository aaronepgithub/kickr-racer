import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import { getFirestore, doc, setDoc, onSnapshot, collection, addDoc, getDoc, updateDoc, serverTimestamp, query, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";


import { firebaseConfig, appId } from './config.js';
import { state } from './state.js';
import { DOMElements } from './dom.js';
import { UIController } from './ui.js';

export const FirebaseController = {
    db: null,
    auth: null,

    async init() {

        try {
            const app = initializeApp(firebaseConfig);
            this.db = getFirestore(app);
            this.auth = getAuth(app);

            await this.authenticate();
        } catch (error) {
            console.error("Firebase initialization failed:", error);
            DOMElements.raceStatus.textContent = "Firebase Error";
        }
    },

    authenticate() {
        return signInAnonymously(this.auth).catch(error => {
            console.error("Anonymous sign-in failed:", error);
        });
    },

    async getCourses() {
        if (!this.db) return [];
        try {
            const coursesCol = collection(this.db, `artifacts/${appId}/public/data/courses`);
            const courseSnapshot = await getDocs(coursesCol);
            const courseList = courseSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return courseList;
        } catch (e) {
            console.error("Error fetching courses: ", e);
            return [];
        }
    },

    async uploadCourse(courseData) {
        if (!this.db) return null;
        try {
            const docRef = await addDoc(collection(this.db, `artifacts/${appId}/public/data/courses`), {
                name: courseData.name,
                gpx: JSON.stringify(courseData.route),
                totalDistance: courseData.totalDistance,
                checkpoints: courseData.checkpoints,
                createdAt: serverTimestamp(),
                recordRun: null, // No record run initially
            });
            console.log("Course uploaded with ID: ", docRef.id);
            return docRef.id;
        } catch (e) {
            console.error("Error uploading course: ", e);
            return null;
        }
    },

    async saveRun(courseId, runData) {
        if (!this.db) return;

        const courseRef = doc(this.db, `artifacts/${appId}/public/data/courses`, courseId);
        try {
            const courseSnap = await getDoc(courseRef);
            if (!courseSnap.exists()) {
                console.error("Course not found for saving run.");
                return;
            }

            const courseData = courseSnap.data();
            const currentRecord = courseData.recordRun;

            // Only consider completed laps for record qualification
            const lapTimes = runData.lapTimes || [];
            const lapCheckpointTimes = runData.lapCheckpointTimes || [];
            if (lapTimes.length > 0) {
                // Compute individual lap durations
                const lapDurations = lapTimes.map((endTime, idx) => {
                    const startTime = idx === 0 ? 0 : lapTimes[idx - 1];
                    return endTime - startTime;
                });

                // Find fastest completed lap
                let fastestIdx = 0;
                let fastestDuration = lapDurations[0];
                for (let i = 1; i < lapDurations.length; i++) {
                    if (lapDurations[i] < fastestDuration) {
                        fastestDuration = lapDurations[i];
                        fastestIdx = i;
                    }
                }

                // Normalize checkpoint times to lap-relative times for the fastest lap
                const lapStartTime = fastestIdx === 0 ? 0 : lapTimes[fastestIdx - 1];
                const recordCheckpointTimes = (lapCheckpointTimes[fastestIdx] || []).map(cp => ({
                    percent: cp.percent,
                    time: cp.time - lapStartTime,
                    distance: cp.distance
                }));

                if (!currentRecord || fastestDuration < currentRecord.totalTime) {
                    // New record based on fastest completed lap
                    await updateDoc(courseRef, {
                        recordRun: {
                            runnerName: runData.runnerName,
                            totalTime: fastestDuration,
                            checkpointTimes: recordCheckpointTimes,
                            achievedAt: serverTimestamp(),
                        }
                    });
                    console.log("New record set for course:", courseId);
                }
            } else {
                // No completed laps; do not consider for record
                // Optionally: log or ignore
            }
        } catch (e) {
            console.error("Error saving run: ", e);
        }
    },

    async saveHighScore(courseId, highScoreData) {
        if (!this.db) return;

        const courseRef = doc(this.db, `artifacts/${appId}/public/data/courses`, courseId);
        try {
            await updateDoc(courseRef, {
                highScore: {
                    name: highScoreData.name,
                    points: highScoreData.points,
                    achievedAt: serverTimestamp(),
                }
            });
            console.log("New high score set for course:", courseId);
        } catch (e) {
            console.error("Error saving high score: ", e);
        }
    }
};
