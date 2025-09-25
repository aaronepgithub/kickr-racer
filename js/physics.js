export const PhysicsController = {
     parseGPX(gpxString, fileName) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(gpxString, "text/xml");
        const points = [];
        const trkpts = xmlDoc.getElementsByTagName("trkpt");

        if (trkpts.length === 0) return null;

        let courseName = fileName.replace('.gpx', '');
        const nameEl = xmlDoc.getElementsByTagName("name")[0];
        if (nameEl) {
            courseName = nameEl.textContent;
        }

        // Limit the number of track points to prevent excessive data
        const maxPoints = 5000;
        const step = Math.max(1, Math.floor(trkpts.length / maxPoints));

        for (let i = 0; i < trkpts.length; i += step) {
            const ele = trkpts[i].getElementsByTagName("ele")[0];
            if (ele) {
                 points.push({
                    lat: parseFloat(trkpts[i].getAttribute("lat")),
                    lon: parseFloat(trkpts[i].getAttribute("lon")),
                    ele: parseFloat(ele.textContent)
                });
            }
        }

        const routeData = [];
        let totalDistanceKm = 0;

        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i+1];
            const distanceKm = this.haversineDistance(p1, p2);
            const elevationChangeM = p2.ele - p1.ele;
            let gradient = (distanceKm > 0) ? (elevationChangeM / (distanceKm * 1000)) * 100 : 0;
            const startDistanceMiles = totalDistanceKm * 0.621371;

            routeData.push({
                startDistance: startDistanceMiles,
                distance: distanceKm * 0.621371,
                gradient: isNaN(gradient) ? 0 : gradient,
                ele: p1.ele,
            });
            totalDistanceKm += distanceKm;
        }

        if (points.length > 0) {
            routeData.push({
                startDistance: totalDistanceKm * 0.621371,
                distance: 0,
                gradient: 0,
                ele: points[points.length-1].ele
            });
        }

        const totalDistanceMiles = totalDistanceKm * 0.621371;
        const checkpoints = [];
        if (totalDistanceMiles > 0) {
            checkpoints.push({
                mile: 0.5, // Represents the 50% mark
                distance: totalDistanceMiles / 2,
            });
        }

        return {
            name: courseName,
            route: routeData,
            totalDistance: totalDistanceMiles,
            checkpoints: checkpoints,
        };
    },
    haversineDistance(p1, p2) {
        const R = 6371; // km
        const dLat = (p2.lat - p1.lat) * Math.PI / 180;
        const dLon = (p2.lon - p1.lon) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },
    // Solves for speed in m/s using a binary search approach
    calculateSpeedMps(power, gradient, weightLbs) {
        const riderWeightKg = weightLbs * 0.453592;
        const totalMass = riderWeightKg + 9; // Add bike weight
        const g = 9.81;
        const Crr = 0.005; // Coefficient of rolling resistance
        const rho = 1.225; // Air density
        const CdA = 0.32; // Drag coefficient * frontal area

        const grade = gradient / 100;

        const forceGravity = totalMass * g * Math.sin(Math.atan(grade));
        const forceRolling = totalMass * g * Math.cos(Math.atan(grade)) * Crr;

        // This function calculates the power required to maintain a given speed 'v'.
        // It's a monotonically increasing function for v >= 0.
        const powerRequired = (v) => {
            const f_drag = 0.5 * rho * CdA * v * v;
            return (forceRolling + forceGravity + f_drag) * v;
        };

        // We use binary search to find the speed 'v' that requires the given 'power'.
        let low = 0;
        let high = 50; // 50 m/s is ~112 mph, a safe upper bound.

        // If power required at max speed is less than rider power, they will accelerate.
        // In our steady-state model, this means they are going at max speed.
        if (powerRequired(high) < power) {
            return high;
        }

        for (let i = 0; i < 30; i++) { // 30 iterations for good precision
            const mid = (low + high) / 2;
            if (powerRequired(mid) < power) {
                low = mid;
            } else {
                high = mid;
            }
        }

        return high; // or low, they will be very close
    }
};