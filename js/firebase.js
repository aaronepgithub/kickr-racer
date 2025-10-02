import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getFirestore,
    collection,
    getDocs,
    addDoc,
    serverTimestamp,
    doc,
    getDoc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
    getAuth,
    signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from './config.js'; // Import the correct config

export const FirebaseController = {
    db: null,
    auth: null,
    appId: null,

    async init() {
        try {
            // Initialize Firebase with the imported config
            const app = initializeApp(firebaseConfig);
            this.db = getFirestore(app);
            this.auth = getAuth(app);
            this.appId = app.options.appId;

            // Sign in anonymously
            await signInAnonymously(this.auth);
            console.log("Signed in anonymously with App ID:", this.appId);

        } catch (error) {
            console.error("Firebase initialization failed:", error);
        }
    },

    async getCourses() {
        if (!this.db || !this.appId) return [];
        try {
            // Use a dynamic path based on the actual appId
            const coursesCol = collection(this.db, `artifacts/${this.appId}/public/data/courses`);
            const courseSnapshot = await getDocs(coursesCol);
            const courseList = courseSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            return courseList;
        } catch (e) {
            console.error("Error getting courses: ", e);
            return [];
        }
    },

    async uploadCourse(courseData) {
        if (!this.db || !this.appId) return null;
        try {
            const docRef = await addDoc(collection(this.db, `artifacts/${this.appId}/public/data/courses`), {
                name: courseData.name,
                gpx: courseData.gpx,
                totalDistance: courseData.totalDistance,
                checkpoints: courseData.checkpoints,
                createdAt: serverTimestamp(),
                recordRun: null,
            });
            console.log("Course uploaded with ID: ", docRef.id);
            return docRef.id;
        } catch (e) {
            console.error("Error uploading course: ", e);
            return null;
        }
    },

    async saveRaceResult(courseId, runData) {
        if (!this.db || !this.appId) return;

        const courseRef = doc(this.db, `artifacts/${this.appId}/public/data/courses`, courseId);
        try {
            const courseSnap = await getDoc(courseRef);
            if (!courseSnap.exists()) {
                console.error("Course not found for saving run.");
                return;
            }

            const courseData = courseSnap.data();
            const currentRecord = courseData.recordRun;

            if (!currentRecord || runData.totalTime < currentRecord.totalTime) {
                console.log("New record! Saving run data...");
                await updateDoc(courseRef, {
                    recordRun: runData
                });
            }
        } catch (error) {
            console.error("Error saving race result: ", error);
        }
    }
};